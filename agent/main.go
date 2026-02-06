package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	provisionUDPPort = 8870
	wsPort           = 8148
	configPath       = "agent_config.json"
	agentVersion     = "0.3.0"
	fakeAgentCount   = 4
)

type PersistedConfig struct {
	AgentID       string `json:"agent_id"`
	AdminIP       string `json:"admin_ip"`
	Secret        string `json:"secret"`
	ProvisionedAt int64  `json:"provisioned_at"`
}

type ProvisionMessage struct {
	Type    string `json:"type"`
	V       int    `json:"v"`
	AdminIP string `json:"admin_ip"`
	Secret  string `json:"secret"`
	Nonce   string `json:"nonce"`
}

type ProvisionAck struct {
	Type    string `json:"type"`
	V       int    `json:"v"`
	AgentID string `json:"agent_id"`
	Host    string `json:"hostname"`
	Nonce   string `json:"nonce"`
	TS      int64  `json:"ts"`
}

type WireMessage struct {
	Type    string      `json:"type"`
	TS      int64       `json:"ts"`
	AgentID string      `json:"agent_id"`
	Payload interface{} `json:"payload"`
}

type RegisterPayload struct {
	AgentID  string   `json:"agent_id"`
	Secret   string   `json:"secret"`
	Hostname string   `json:"hostname"`
	IPs      []string `json:"ips"`
	OS       string   `json:"os"`
	Arch     string   `json:"arch"`
	Version  string   `json:"version"`
}

type HeartbeatPayload struct {
	Status   string                 `json:"status"`
	LastSeen int64                  `json:"last_seen"`
	Metrics  map[string]interface{} `json:"metrics,omitempty"`
}

type TaskPayload struct {
	TaskID string                 `json:"task_id"`
	Kind   string                 `json:"kind"`
	Params map[string]interface{} `json:"params"`
}

type TaskResultPayload struct {
	TaskID string      `json:"task_id"`
	OK     bool        `json:"ok"`
	Result interface{} `json:"result"`
	Error  *string     `json:"error,omitempty"`
}

type RegisteredResponse struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

type AgentProfile struct {
	AgentID  string
	Hostname string
	IPs      []string
	IsFake   bool
}

type AgentClient struct {
	profile   AgentProfile
	adminIP   string
	secret    string
	heartbeat time.Duration
	conn      *websocket.Conn
	writeMu   sync.Mutex
	probeMu   sync.Mutex
	probe     ProbeState
}

type ProbeState struct {
	internet          *bool
	dns               *bool
	gateway           *bool
	latencyMS         *int64
	internetFailCount int
	dnsFailCount      int
	gatewayFailCount  int
}

func main() {
	fake := flag.Bool("fake", false, "Run in fake provisioning mode")
	flag.Parse()

	if *fake {
		runFakeMode()
		return
	}

	runNormalMode()
}

func runNormalMode() {
	hostname, _ := os.Hostname()
	agentID := stableAgentID("")

	for {
		cfg, err := waitForProvision(agentID, hostname)
		if err != nil {
			log.Printf("provisioning listener error: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		profile := AgentProfile{AgentID: cfg.AgentID, Hostname: hostname, IPs: localIPv4s(), IsFake: false}
		client := newAgentClient(profile, cfg.AdminIP, cfg.Secret, jitterDuration(5, 10))
		_ = client.runWithSleepLifecycle(context.Background())
	}
}

func runFakeMode() {
	hostname, _ := os.Hostname()
	controllerID := stableAgentID("")

	for {
		cfg, err := waitForProvision(controllerID, hostname)
		if err != nil {
			log.Printf("failed provisioning in fake mode: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		ctx, cancel := context.WithCancel(context.Background())
		var doneOnce int32
		disconnectCh := make(chan struct{}, 1)

		for i := 1; i <= fakeAgentCount; i++ {
			profile := AgentProfile{
				AgentID:  uuid.NewString(),
				Hostname: fmt.Sprintf("LABSCAN-FAKE-%03d", i),
				IPs:      []string{fmt.Sprintf("192.168.1.%d", 100+i)},
				IsFake:   true,
			}

			client := newAgentClient(profile, cfg.AdminIP, cfg.Secret, jitterDuration(5, 10))
			go func(c *AgentClient) {
				_ = c.runWithSleepLifecycle(ctx)
				if atomic.CompareAndSwapInt32(&doneOnce, 0, 1) {
					disconnectCh <- struct{}{}
				}
			}(client)
		}

		log.Printf("Fake mode: spawned 4 agents")
		<-disconnectCh
		cancel()
	}
}

func waitForProvision(agentID, hostname string) (*PersistedConfig, error) {
	listenAddr := fmt.Sprintf(":%d", provisionUDPPort)
	conn, err := net.ListenPacket("udp4", listenAddr)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	log.Printf("Sleep mode: waiting for admin provisioning on UDP 8870...")

	buffer := make([]byte, 4096)
	for {
		n, sender, err := conn.ReadFrom(buffer)
		if err != nil {
			return nil, err
		}

		senderUDP, ok := sender.(*net.UDPAddr)
		if !ok || !isPrivateIP(senderUDP.IP) {
			continue
		}

		var provision ProvisionMessage
		if err := json.Unmarshal(buffer[:n], &provision); err != nil {
			continue
		}

		if provision.Type != "LABSCAN_PROVISION" || provision.V != 1 {
			continue
		}
		if strings.TrimSpace(provision.AdminIP) == "" || strings.TrimSpace(provision.Secret) == "" || strings.TrimSpace(provision.Nonce) == "" {
			continue
		}

		cfg := &PersistedConfig{
			AgentID:       stableAgentID(agentID),
			AdminIP:       provision.AdminIP,
			Secret:        provision.Secret,
			ProvisionedAt: nowMS(),
		}

		if err := saveConfig(cfg); err != nil {
			log.Printf("warning: failed to persist config: %v", err)
		}

		ack := ProvisionAck{
			Type:    "LABSCAN_PROVISION_ACK",
			V:       1,
			AgentID: cfg.AgentID,
			Host:    hostname,
			Nonce:   provision.Nonce,
			TS:      nowMS(),
		}
		if raw, err := json.Marshal(ack); err == nil {
			_, _ = conn.WriteTo(raw, sender)
		}

		log.Printf("Provisioned by %s, connecting to WS 8148...", provision.AdminIP)
		return cfg, nil
	}
}

func newAgentClient(profile AgentProfile, adminIP, secret string, heartbeat time.Duration) *AgentClient {
	if heartbeat <= 0 {
		heartbeat = 8 * time.Second
	}
	return &AgentClient{profile: profile, adminIP: adminIP, secret: secret, heartbeat: heartbeat}
}

func (c *AgentClient) runWithSleepLifecycle(ctx context.Context) error {
	retryDelays := []time.Duration{3 * time.Second, 5 * time.Second, 8 * time.Second}
	failureCount := 0

	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		registered, err := c.runSession(ctx)
		if err != nil {
			log.Printf("[%s] session ended: %v", c.profile.Hostname, err)
		}

		if registered {
			failureCount = 0
			continue
		}

		if failureCount >= len(retryDelays) {
			log.Printf("Admin offline detected, entering sleep mode...")
			return errors.New("admin offline")
		}

		delay := retryDelays[failureCount]
		failureCount++

		select {
		case <-ctx.Done():
			return nil
		case <-time.After(delay):
		}
	}
}

func (c *AgentClient) runSession(parent context.Context) (bool, error) {
	select {
	case <-parent.Done():
		return false, parent.Err()
	default:
	}

	url := fmt.Sprintf("ws://%s:%d/ws/agent", c.adminIP, wsPort)
	log.Printf("WS dial url=%s", url)
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		log.Printf("WS dial failed err=%v", err)
		return false, fmt.Errorf("dial failed: %w", err)
	}
	log.Printf("WS connected agent_id=%s", c.profile.AgentID)
	defer conn.Close()

	c.conn = conn
	ctx, cancel := context.WithCancel(parent)
	defer cancel()

	if err := c.send("register", RegisterPayload{
		AgentID:  c.profile.AgentID,
		Secret:   c.secret,
		Hostname: c.profile.Hostname,
		IPs:      c.profile.IPs,
		OS:       runtime.GOOS,
		Arch:     runtime.GOARCH,
		Version:  agentVersion,
	}); err != nil {
		return false, err
	}

	registered := make(chan bool, 1)
	errCh := make(chan error, 1)
	go func() {
		errCh <- c.readLoop(ctx, registered)
	}()

	select {
	case ok := <-registered:
		if !ok {
			log.Printf("WS register rejected agent_id=%s", c.profile.AgentID)
			return false, errors.New("registration rejected")
		}
		log.Printf("WS register accepted agent_id=%s", c.profile.AgentID)
	case err := <-errCh:
		log.Printf("WS closed err=%v -> entering sleep", err)
		return false, err
	case <-time.After(10 * time.Second):
		log.Printf("WS register timeout agent_id=%s", c.profile.AgentID)
		return false, errors.New("register timeout")
	}

	go c.heartbeatLoop(ctx)
	go c.probeLoop(ctx)
	err = <-errCh
	if err != nil {
		log.Printf("WS closed err=%v -> entering sleep", err)
	}
	return true, err
}

func (c *AgentClient) readLoop(ctx context.Context, registered chan<- bool) error {
	registeredSent := false

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return err
		}

		var message struct {
			Type    string          `json:"type"`
			Payload json.RawMessage `json:"payload"`
		}
		if err := json.Unmarshal(raw, &message); err != nil {
			continue
		}

		switch message.Type {
		case "registered":
			var payload RegisteredResponse
			if err := json.Unmarshal(message.Payload, &payload); err != nil {
				continue
			}
			log.Printf("WS registered response agent_id=%s ok=%v", c.profile.AgentID, payload.OK)
			if !registeredSent {
				registered <- payload.OK
				registeredSent = true
			}
			if !payload.OK {
				return errors.New(payload.Error)
			}

		case "task":
			var payload TaskPayload
			if err := json.Unmarshal(message.Payload, &payload); err != nil {
				continue
			}
			go c.executeTask(payload)

		case "task_cancel":
			continue
		}

		select {
		case <-ctx.Done():
			return nil
		default:
		}
	}
}

func (c *AgentClient) heartbeatLoop(ctx context.Context) {
	for {
		wait := jitterDuration(5, 10)

		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
			internet, dns, gateway, latency := c.probeSnapshot()
			payload := HeartbeatPayload{
				Status:   "idle",
				LastSeen: nowMS(),
				Metrics: map[string]interface{}{
					"goroutines":         runtime.NumGoroutine(),
					"internet_reachable": internet,
					"dns_ok":             dns,
					"gateway_reachable":  gateway,
					"latency_ms":         latency,
				},
			}
			if err := c.send("heartbeat", payload); err != nil {
				return
			}
		}
	}
}

func (c *AgentClient) probeLoop(ctx context.Context) {
	probeAndStore := func() {
		internetOK, latency := probeInternet()
		dnsOK := probeDNS()
		gatewayOK := probeGateway()

		c.probeMu.Lock()
		defer c.probeMu.Unlock()

		c.probe.internet = applyDebounce(c.probe.internet, internetOK, &c.probe.internetFailCount)
		c.probe.dns = applyDebounce(c.probe.dns, dnsOK, &c.probe.dnsFailCount)
		c.probe.gateway = applyDebounce(c.probe.gateway, gatewayOK, &c.probe.gatewayFailCount)
		if internetOK {
			lat := latency
			c.probe.latencyMS = &lat
		} else {
			c.probe.latencyMS = nil
		}
	}

	probeAndStore()
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			probeAndStore()
		}
	}
}

func (c *AgentClient) probeSnapshot() (*bool, *bool, *bool, *int64) {
	c.probeMu.Lock()
	defer c.probeMu.Unlock()

	var internet *bool
	if c.probe.internet != nil {
		v := *c.probe.internet
		internet = &v
	}
	var dns *bool
	if c.probe.dns != nil {
		v := *c.probe.dns
		dns = &v
	}
	var gateway *bool
	if c.probe.gateway != nil {
		v := *c.probe.gateway
		gateway = &v
	}
	var latency *int64
	if c.probe.latencyMS != nil {
		v := *c.probe.latencyMS
		latency = &v
	}

	return internet, dns, gateway, latency
}

func (c *AgentClient) executeTask(task TaskPayload) {
	result, err := runTask(c.profile.IsFake, task.Kind, task.Params)
	response := TaskResultPayload{TaskID: task.TaskID, OK: err == nil, Result: result}
	if err != nil {
		errText := err.Error()
		response.Error = &errText
	}
	_ = c.send("task_result", response)
}

func runTask(fake bool, kind string, params map[string]interface{}) (interface{}, error) {
	if fake {
		switch kind {
		case "ping":
			return map[string]interface{}{"ok": true, "latency_ms": 5 + rand.Intn(25)}, nil
		case "port_scan":
			ports := asIntSlice(params["ports"], []int{22, 80, 443})
			openPorts := make([]int, 0)
			for _, p := range ports {
				if p%2 == 0 || p == 443 {
					openPorts = append(openPorts, p)
				}
			}
			return map[string]interface{}{"open_ports": openPorts, "scanned": len(ports)}, nil
		case "arp_snapshot":
			entries := []string{
				"192.168.1.1 aa-bb-cc-dd-ee-01 dynamic",
				"192.168.1.20 aa-bb-cc-dd-ee-14 dynamic",
				"192.168.1.51 aa-bb-cc-dd-ee-51 dynamic",
			}
			return map[string]interface{}{"entries": entries, "count": len(entries)}, nil
		default:
			return nil, fmt.Errorf("unsupported task kind: %s", kind)
		}
	}

	switch kind {
	case "ping":
		return runRealPing(params)
	case "port_scan":
		return runRealPortScan(params)
	case "arp_snapshot":
		return runRealARPSnapshot()
	default:
		return nil, fmt.Errorf("unsupported task kind: %s", kind)
	}
}

func runRealPing(params map[string]interface{}) (interface{}, error) {
	target := asString(params["target"], "8.8.8.8")
	timeoutMS := asInt(params["timeout_ms"], 1200)
	addr := net.JoinHostPort(target, "80")

	start := time.Now()
	conn, err := net.DialTimeout("tcp", addr, time.Duration(timeoutMS)*time.Millisecond)
	if err != nil {
		return map[string]interface{}{"target": target, "ok": false}, nil
	}
	_ = conn.Close()

	return map[string]interface{}{
		"target":     target,
		"ok":         true,
		"latency_ms": time.Since(start).Milliseconds(),
	}, nil
}

func runRealPortScan(params map[string]interface{}) (interface{}, error) {
	target := asString(params["target"], "127.0.0.1")
	ports := asIntSlice(params["ports"], []int{22, 80, 443})
	timeoutMS := asInt(params["timeout_ms"], 700)

	openPorts := make([]int, 0)
	for _, port := range ports {
		addr := fmt.Sprintf("%s:%d", target, port)
		conn, err := net.DialTimeout("tcp", addr, time.Duration(timeoutMS)*time.Millisecond)
		if err == nil {
			openPorts = append(openPorts, port)
			_ = conn.Close()
		}
	}

	return map[string]interface{}{"target": target, "open_ports": openPorts, "scanned": len(ports)}, nil
}

func runRealARPSnapshot() (interface{}, error) {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("arp", "-a")
	} else {
		cmd = exec.Command("ip", "neigh")
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("arp snapshot failed: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	return map[string]interface{}{"entries": lines, "count": len(lines)}, nil
}

func (c *AgentClient) send(messageType string, payload interface{}) error {
	if c.conn == nil {
		return errors.New("connection unavailable")
	}

	wire := WireMessage{Type: messageType, TS: nowMS(), AgentID: c.profile.AgentID, Payload: payload}
	raw, err := json.Marshal(wire)
	if err != nil {
		return err
	}

	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return c.conn.WriteMessage(websocket.TextMessage, raw)
}

func loadConfig() (*PersistedConfig, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, err
	}

	var cfg PersistedConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	if cfg.AgentID == "" {
		cfg.AgentID = uuid.NewString()
	}
	return &cfg, nil
}

func saveConfig(cfg *PersistedConfig) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath, data, 0o644)
}

func stableAgentID(existing string) string {
	if strings.TrimSpace(existing) != "" {
		return existing
	}
	if cfg, err := loadConfig(); err == nil && strings.TrimSpace(cfg.AgentID) != "" {
		return cfg.AgentID
	}
	return uuid.NewString()
}

func localIPv4s() []string {
	interfaces, err := net.Interfaces()
	if err != nil {
		return []string{}
	}

	ips := make([]string, 0)
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			netAddr, ok := addr.(*net.IPNet)
			if !ok || netAddr.IP == nil || netAddr.IP.IsLoopback() {
				continue
			}
			if ip4 := netAddr.IP.To4(); ip4 != nil {
				ips = append(ips, ip4.String())
			}
		}
	}

	if len(ips) == 0 {
		return []string{"127.0.0.1"}
	}
	return ips
}

func isPrivateIP(ip net.IP) bool {
	ip4 := ip.To4()
	if ip4 == nil {
		return false
	}

	if ip4[0] == 10 {
		return true
	}
	if ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31 {
		return true
	}
	if ip4[0] == 192 && ip4[1] == 168 {
		return true
	}
	if ip4[0] == 127 {
		return true
	}
	return false
}

func applyDebounce(current *bool, probeOK bool, failCount *int) *bool {
	if probeOK {
		*failCount = 0
		value := true
		return &value
	}

	*failCount = *failCount + 1
	if current == nil {
		if *failCount >= 2 {
			value := false
			return &value
		}
		return nil
	}

	if *current && *failCount >= 2 {
		value := false
		return &value
	}

	return current
}

func probeInternet() (bool, int64) {
	targets := []string{"1.1.1.1:443", "8.8.8.8:53"}
	for _, target := range targets {
		start := time.Now()
		conn, err := net.DialTimeout("tcp", target, 2*time.Second)
		if err == nil {
			_ = conn.Close()
			return true, time.Since(start).Milliseconds()
		}
	}
	return false, 0
}

func probeDNS() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	resolver := net.Resolver{}
	_, err := resolver.LookupHost(ctx, "example.com")
	return err == nil
}

func probeGateway() bool {
	gateways := []string{"192.168.1.1:53", "10.0.0.1:53", "172.16.0.1:53"}
	for _, gateway := range gateways {
		conn, err := net.DialTimeout("tcp", gateway, 1500*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return true
		}
	}
	return false
}

func jitterDuration(minSeconds, maxSeconds int) time.Duration {
	if minSeconds < 1 {
		minSeconds = 1
	}
	if maxSeconds < minSeconds {
		maxSeconds = minSeconds
	}
	rangeSize := maxSeconds - minSeconds + 1
	return time.Duration(minSeconds+rand.Intn(rangeSize)) * time.Second
}

func asString(v interface{}, fallback string) string {
	if s, ok := v.(string); ok {
		trimmed := strings.TrimSpace(s)
		if trimmed != "" {
			return trimmed
		}
	}
	return fallback
}

func asInt(v interface{}, fallback int) int {
	switch value := v.(type) {
	case int:
		return value
	case float64:
		return int(value)
	default:
		return fallback
	}
}

func asIntSlice(v interface{}, fallback []int) []int {
	values, ok := v.([]interface{})
	if !ok {
		return fallback
	}

	ports := make([]int, 0, len(values))
	for _, raw := range values {
		switch val := raw.(type) {
		case int:
			ports = append(ports, val)
		case float64:
			ports = append(ports, int(val))
		}
	}
	if len(ports) == 0 {
		return fallback
	}
	return ports
}

func nowMS() int64 {
	return time.Now().UnixMilli()
}
