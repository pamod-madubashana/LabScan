package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"time"

	"github.com/google/uuid"
)

const (
	multicastGroup = "239.255.77.77"
	multicastPort  = 47777
)

type Config struct {
	AdminURL     string `json:"admin_url"`
	JoinToken    string `json:"join_token"`
	DeviceID     string `json:"device_id"`
	TLSFingerprint string `json:"tls_fingerprint"`
}

type BeaconPayload struct {
	Type               string `json:"type"`
	Version            string `json:"version"`
	AdminHTTPSURL      string `json:"admin_https_url"`
	TLSFingerprintSHA256 string `json:"tls_fingerprint_sha256"`
	JoinToken          string `json:"join_token"`
	IssuedAtUnix       int64  `json:"issued_at_unix"`
}

type DeviceInfo struct {
	Hostname     string  `json:"hostname"`
	OS           string  `json:"os"`
	Arch         string  `json:"arch"`
	AgentVersion string  `json:"agent_version"`
	LocalIP      string  `json:"local_ip"`
	MacAddress   *string `json:"mac_address,omitempty"`
	GatewayIP    *string `json:"gateway_ip,omitempty"`
	DNSServers   *string `json:"dns_servers,omitempty"`
}

type RegisterRequest struct {
	JoinToken string     `json:"join_token"`
	Device    DeviceInfo `json:"device"`
}

type HeartbeatRequest struct {
	DeviceID         string `json:"device_id"`
	GatewayReachable bool   `json:"gateway_reachable"`
	DNSResolves      bool   `json:"dns_resolves"`
	HTTPSLatencyMS   *int64 `json:"https_latency_ms,omitempty"`
	LocalPorts       []int  `json:"local_ports,omitempty"`
}

func main() {
	configPath := flag.String("config", "config.json", "Path to config file")
	adminURL := flag.String("admin-url", "", "Admin server URL")
	joinToken := flag.String("token", "", "Join token")
	flag.Parse()

	config, err := loadOrCreateConfig(*configPath, *adminURL, *joinToken)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if config.AdminURL == "" {
		log.Println("No admin URL configured, entering discovery mode...")
		err = discoverAndRegister(config, *configPath)
		if err != nil {
			log.Fatalf("Discovery failed: %v", err)
		}
	}

	log.Printf("Starting heartbeat to %s", config.AdminURL)
	startHeartbeat(config)
}

func loadOrCreateConfig(path, adminURL, joinToken string) (*Config, error) {
	config := &Config{}
	
	if _, err := os.Stat(path); os.IsNotExist(err) {
		// Create new config
		config.DeviceID = uuid.New().String()
		config.AdminURL = adminURL
		config.JoinToken = joinToken
		return config, saveConfig(path, config)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	err = json.Unmarshal(data, config)
	if err != nil {
		return nil, err
	}

	// Override with command line args if provided
	if adminURL != "" {
		config.AdminURL = adminURL
	}
	if joinToken != "" {
		config.JoinToken = joinToken
	}

	return config, nil
}

func saveConfig(path string, config *Config) error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func discoverAndRegister(config *Config, configPath string) error {
	log.Println("Listening for admin beacon...")
	
	addr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", multicastGroup, multicastPort))
	if err != nil {
		return fmt.Errorf("failed to resolve address: %v", err)
	}

	conn, err := net.ListenMulticastUDP("udp", nil, addr)
	if err != nil {
		return fmt.Errorf("failed to listen on multicast: %v", err)
	}
	defer conn.Close()

	conn.SetReadDeadline(time.Now().Add(30 * time.Second))

	buffer := make([]byte, 1024)
	n, _, err := conn.ReadFromUDP(buffer)
	if err != nil {
		return fmt.Errorf("failed to read beacon: %v", err)
	}

	var beacon BeaconPayload
	err = json.Unmarshal(buffer[:n], &beacon)
	if err != nil {
		return fmt.Errorf("failed to parse beacon: %v", err)
	}

	if beacon.Type != "NETMON_ADMIN" || beacon.Version != "1" {
		return fmt.Errorf("invalid beacon type or version")
	}

	log.Printf("Discovered admin at %s", beacon.AdminHTTPSURL)
	
	// Store admin info
	config.AdminURL = beacon.AdminHTTPSURL
	config.JoinToken = beacon.JoinToken
	config.TLSFingerprint = beacon.TLSFingerprintSHA256
	
	err = saveConfig(configPath, config)
	if err != nil {
		return fmt.Errorf("failed to save config: %v", err)
	}

	// Register with admin
	deviceInfo := getDeviceInfo()
	registerReq := RegisterRequest{
		JoinToken: config.JoinToken,
		Device:    deviceInfo,
	}

	// TODO: Implement HTTPS registration
	log.Printf("Would register device: %+v", deviceInfo)
	
	return nil
}

func getDeviceInfo() DeviceInfo {
	hostname, _ := os.Hostname()
	
	localIP := getLocalIP()
	macAddr := getMacAddress()
	gateway := getGateway()
	dns := getDNSServers()

	return DeviceInfo{
		Hostname:     hostname,
		OS:           "windows", // TODO: detect actual OS
		Arch:         "amd64",   // TODO: detect actual arch
		AgentVersion: "0.1.0",
		LocalIP:      localIP,
		MacAddress:   macAddr,
		GatewayIP:    gateway,
		DNSServers:   dns,
	}
}

func getLocalIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()
	
	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

func getMacAddress() *string {
	// Simplified implementation
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp != 0 && len(iface.HardwareAddr) > 0 {
			mac := iface.HardwareAddr.String()
			return &mac
		}
	}
	return nil
}

func getGateway() *string {
	// Placeholder - platform specific implementation needed
	return nil
}

func getDNSServers() *string {
	// Placeholder - platform specific implementation needed
	return nil
}

func startHeartbeat(config *Config) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			performChecks(config)
		}
	}
}

func performChecks(config *Config) {
	// Gateway reachability check
	gatewayReachable := checkGateway()

	// DNS resolution check
	dnsResolves := checkDNS()

	// HTTPS probe
	latency := checkHTTPS()

	heartbeat := HeartbeatRequest{
		DeviceID:         config.DeviceID,
		GatewayReachable: gatewayReachable,
		DNSResolves:      dnsResolves,
		HTTPSLatencyMS:   latency,
	}

	// TODO: Send heartbeat to admin server
	log.Printf("Heartbeat: %+v", heartbeat)
}

func checkGateway() bool {
	// Simple ICMP ping simulation
	_, err := net.DialTimeout("tcp", "8.8.8.8:53", 3*time.Second)
	return err == nil
}

func checkDNS() bool {
	_, err := net.LookupHost("example.com")
	return err == nil
}

func checkHTTPS() *int64 {
	start := time.Now()
	conn, err := net.DialTimeout("tcp", "google.com:443", 5*time.Second)
	if err != nil {
		return nil
	}
	defer conn.Close()
	
	duration := time.Since(start).Milliseconds()
	return &duration
}