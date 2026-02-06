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
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	defaultAdminURL = "ws://127.0.0.1:8787/ws/agent"
	defaultSecret   = "labscan-dev-secret"
	agentVersion    = "0.2.0"
)

type Config struct {
	AdminURL           string `json:"admin_url"`
	AgentID            string `json:"agent_id"`
	Secret             string `json:"secret"`
	HeartbeatIntervalS int    `json:"heartbeat_interval_s"`
	ReconnectMinMS     int    `json:"reconnect_min_ms"`
	ReconnectMaxMS     int    `json:"reconnect_max_ms"`
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
	OK          bool                   `json:"ok"`
	Error       string                 `json:"error,omitempty"`
	ServerTime  int64                  `json:"server_time"`
	AgentConfig map[string]interface{} `json:"agent_config,omitempty"`
}

type AgentClient struct {
	config  *Config
	conn    *websocket.Conn
	writeMu sync.Mutex
}

func main() {
	configPath := flag.String("config", "config.json", "Path to config file")
	adminURL := flag.String("admin-url", "", "Admin websocket URL")
	secret := flag.String("secret", "", "Shared secret")
	flag.Parse()

	config, err := loadOrCreateConfig(*configPath, *adminURL, *secret)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	client := &AgentClient{config: config}
	client.runForever()
}

func (c *AgentClient) runForever() {
	backoff := time.Duration(c.config.ReconnectMinMS) * time.Millisecond
	maxBackoff := time.Duration(c.config.ReconnectMaxMS) * time.Millisecond

	for {
		err := c.runSession()
		if err != nil {
			log.Printf("session ended: %v", err)
		}

		jitter := time.Duration(rand.Intn(350)) * time.Millisecond
		sleepFor := backoff + jitter
		log.Printf("reconnecting in %s", sleepFor)
		time.Sleep(sleepFor)

		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

func (c *AgentClient) runSession() error {
	log.Printf("connecting to %s", c.config.AdminURL)
	conn, _, err := websocket.DefaultDialer.Dial(c.config.AdminURL, nil)
	if err != nil {
		return fmt.Errorf("websocket dial failed: %w", err)
	}
	defer conn.Close()

	c.conn = conn
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := c.sendRegister(); err != nil {
		return err
	}

	registeredOK := make(chan struct{})
	errCh := make(chan error, 1)

	go func() {
		errCh <- c.readLoop(ctx, registeredOK)
	}()

	select {
	case <-registeredOK:
		log.Printf("register acknowledged by admin")
	case err := <-errCh:
		return err
	case <-time.After(10 * time.Second):
		return errors.New("timeout waiting for register response")
	}

	go c.heartbeatLoop(ctx)
	return <-errCh
}

func (c *AgentClient) readLoop(ctx context.Context, registeredOK chan<- struct{}) error {
	registeredSeen := false

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return err
		}

		var message struct {
			Type    string          `json:"type"`
			TS      int64           `json:"ts"`
			AgentID string          `json:"agent_id"`
			Payload json.RawMessage `json:"payload"`
		}

		if err := json.Unmarshal(raw, &message); err != nil {
			continue
		}

		switch message.Type {
		case "registered":
			var payload RegisteredResponse
			if err := json.Unmarshal(message.Payload, &payload); err != nil {
				return fmt.Errorf("invalid registered payload: %w", err)
			}
			if !payload.OK {
				return fmt.Errorf("registration rejected: %s", payload.Error)
			}
			if !registeredSeen {
				registeredSeen = true
				registeredOK <- struct{}{}
			}

		case "task":
			var task TaskPayload
			if err := json.Unmarshal(message.Payload, &task); err != nil {
				continue
			}
			go c.executeTask(task)

		case "task_cancel":
			// Cancellation can be added with per-task contexts later.
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
	interval := time.Duration(c.config.HeartbeatIntervalS) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			payload := HeartbeatPayload{
				Status:   "idle",
				LastSeen: nowMS(),
				Metrics: map[string]interface{}{
					"goroutines": runtime.NumGoroutine(),
				},
			}
			if err := c.send("heartbeat", payload); err != nil {
				return
			}
		}
	}
}

func (c *AgentClient) sendRegister() error {
	hostname, _ := os.Hostname()
	payload := RegisterPayload{
		AgentID:  c.config.AgentID,
		Secret:   c.config.Secret,
		Hostname: hostname,
		IPs:      localIPs(),
		OS:       runtime.GOOS,
		Arch:     runtime.GOARCH,
		Version:  agentVersion,
	}

	return c.send("register", payload)
}

func (c *AgentClient) sendLog(level, message string, context map[string]interface{}) {
	_ = c.send("log", map[string]interface{}{
		"level":   strings.ToUpper(level),
		"message": message,
		"context": context,
	})
}

func (c *AgentClient) send(messageType string, payload interface{}) error {
	if c.conn == nil {
		return errors.New("connection not available")
	}

	msg := WireMessage{
		Type:    messageType,
		TS:      nowMS(),
		AgentID: c.config.AgentID,
		Payload: payload,
	}

	raw, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return c.conn.WriteMessage(websocket.TextMessage, raw)
}

func (c *AgentClient) executeTask(task TaskPayload) {
	c.sendLog("INFO", fmt.Sprintf("running task %s (%s)", task.TaskID, task.Kind), map[string]interface{}{"task_id": task.TaskID})

	result, err := runTask(task.Kind, task.Params)
	response := TaskResultPayload{
		TaskID: task.TaskID,
		OK:     err == nil,
		Result: result,
	}

	if err != nil {
		errText := err.Error()
		response.Error = &errText
		c.sendLog("ERROR", fmt.Sprintf("task %s failed: %v", task.TaskID, err), map[string]interface{}{"task_id": task.TaskID})
	} else {
		c.sendLog("INFO", fmt.Sprintf("task %s done", task.TaskID), map[string]interface{}{"task_id": task.TaskID})
	}

	_ = c.send("task_result", response)
}

func runTask(kind string, params map[string]interface{}) (interface{}, error) {
	switch kind {
	case "ping":
		return runPing(params)
	case "port_scan":
		return runPortScan(params)
	case "arp_snapshot":
		return runARPSnapshot()
	default:
		return nil, fmt.Errorf("unsupported task kind: %s", kind)
	}
}

func runPing(params map[string]interface{}) (interface{}, error) {
	target := asString(params["target"], "8.8.8.8")
	timeoutMS := asInt(params["timeout_ms"], 1200)
	addr := target
	if !strings.Contains(target, ":") {
		addr = net.JoinHostPort(target, "80")
	}

	start := time.Now()
	conn, err := net.DialTimeout("tcp", addr, time.Duration(timeoutMS)*time.Millisecond)
	if err != nil {
		return map[string]interface{}{
			"target": target,
			"ok":     false,
		}, nil
	}
	_ = conn.Close()

	return map[string]interface{}{
		"target":     target,
		"ok":         true,
		"latency_ms": time.Since(start).Milliseconds(),
	}, nil
}

func runPortScan(params map[string]interface{}) (interface{}, error) {
	target := asString(params["target"], "127.0.0.1")
	timeoutMS := asInt(params["timeout_ms"], 600)
	ports := asIntSlice(params["ports"], []int{22, 80, 443})

	openPorts := make([]int, 0)
	for _, port := range ports {
		addr := fmt.Sprintf("%s:%d", target, port)
		conn, err := net.DialTimeout("tcp", addr, time.Duration(timeoutMS)*time.Millisecond)
		if err == nil {
			openPorts = append(openPorts, port)
			_ = conn.Close()
		}
	}

	return map[string]interface{}{
		"target":     target,
		"scanned":    len(ports),
		"open_ports": openPorts,
	}, nil
}

func runARPSnapshot() (interface{}, error) {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("arp", "-a")
	} else {
		cmd = exec.Command("ip", "neigh")
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to capture arp table: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	return map[string]interface{}{
		"entries": lines,
		"count":   len(lines),
	}, nil
}

func loadOrCreateConfig(path, adminURL, secret string) (*Config, error) {
	config := &Config{}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		config.AdminURL = fallback(adminURL, defaultAdminURL)
		config.Secret = fallback(secret, defaultSecret)
		config.AgentID = uuid.New().String()
		config.HeartbeatIntervalS = 8
		config.ReconnectMinMS = 1000
		config.ReconnectMaxMS = 20000
		return config, saveConfig(path, config)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(data, config); err != nil {
		return nil, err
	}

	if config.AgentID == "" {
		config.AgentID = uuid.New().String()
	}
	if config.AdminURL == "" {
		config.AdminURL = defaultAdminURL
	}
	if config.Secret == "" {
		config.Secret = defaultSecret
	}
	if config.HeartbeatIntervalS <= 0 {
		config.HeartbeatIntervalS = 8
	}
	if config.ReconnectMinMS <= 0 {
		config.ReconnectMinMS = 1000
	}
	if config.ReconnectMaxMS < config.ReconnectMinMS {
		config.ReconnectMaxMS = config.ReconnectMinMS * 4
	}

	if adminURL != "" {
		config.AdminURL = adminURL
	}
	if secret != "" {
		config.Secret = secret
	}

	if err := saveConfig(path, config); err != nil {
		return nil, err
	}

	return config, nil
}

func saveConfig(path string, config *Config) error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0o644)
}

func localIPs() []string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}

	ips := make([]string, 0)
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok || ipNet.IP.IsLoopback() || ipNet.IP.To4() == nil {
				continue
			}
			ips = append(ips, ipNet.IP.String())
		}
	}
	return ips
}

func asString(v interface{}, fallback string) string {
	if value, ok := v.(string); ok && strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func asInt(v interface{}, fallback int) int {
	switch value := v.(type) {
	case float64:
		return int(value)
	case int:
		return value
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
	for _, value := range values {
		switch typed := value.(type) {
		case float64:
			ports = append(ports, int(typed))
		case int:
			ports = append(ports, typed)
		}
	}

	if len(ports) == 0 {
		return fallback
	}
	return ports
}

func fallback(candidate, defaultValue string) string {
	if strings.TrimSpace(candidate) == "" {
		return defaultValue
	}
	return candidate
}

func nowMS() int64 {
	return time.Now().UnixMilli()
}
