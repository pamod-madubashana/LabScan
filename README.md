# LabScan - University LAN Monitoring Prototype

A zero-config LAN monitoring system with Tauri admin dashboard and Go client agents.

## Architecture

- **Admin App**: Tauri v2 + React + TypeScript + Rust (Axum server)
- **Client Agents**: Go single-binary agents
- **Discovery**: UDP multicast beacon + mDNS fallback
- **Security**: TLS fingerprint pinning + join tokens

## Features

- Zero-config client onboarding via multicast discovery
- Real-time device monitoring dashboard
- Network connectivity testing (gateway, DNS, HTTPS probes)
- Secure registration with time-limited join tokens
- Passive discovery (clients only listen, don't scan)

## Directories

- `/admin` - Tauri admin application
- `/agent` - Go client agent

## Quick Start

### 1. Start Admin Dashboard

```bash
cd admin
npm install
npm run tauri dev
```

In the dashboard:
1. Click "Start Server" to begin the HTTPS server on port 8443
2. Click "Generate Join Token" to create a registration token
3. Note the join token for client registration

### 2. Build and Run Client Agent

```bash
cd agent
# If Go is installed:
go build -o labscan-agent
./labscan-agent

# Or on Windows:
go build -o labscan-agent.exe
labscan-agent.exe
```

The agent will:
1. Listen for UDP multicast beacons from the admin
2. Automatically register when it discovers the admin server
3. Begin sending periodic heartbeats with network status

### 3. Monitor Devices

The admin dashboard will show:
- Connected devices with their status
- Last seen timestamps
- Network connectivity information
- Online/offline status

## Security

- All communication uses HTTPS with self-signed certificates
- Clients pin the admin's TLS fingerprint
- Registration requires time-limited join tokens
- No persistent installation without explicit user consent

## Network Discovery

**Primary Method (UDP Multicast):**
- Admin broadcasts beacons to 239.255.77.77:47777 every 2 seconds
- Clients passively listen for beacons
- Beacon contains admin URL, TLS fingerprint, and join token

**Secondary Method (mDNS):**
- Admin advertises `_netmon._tcp.local` service
- Clients can discover via standard mDNS browsers

**Manual Fallback:**
- Clients can be configured with admin URL and token via CLI flags

## Development

### Admin App Structure
```
admin/
├── src/                 # React frontend
├── src-tauri/          # Rust backend
│   ├── src/main.rs     # Tauri entry point
│   ├── src/server.rs   # HTTPS API server
│   ├── src/database.rs # SQLite database
│   └── src/discovery.rs # Network discovery
└── Cargo.toml          # Rust dependencies
```

### Agent Structure
```
agent/
├── main.go             # Main agent logic
├── go.mod              # Go dependencies
└── README.md           # Agent documentation
```

## Requirements

- **Admin**: Node.js 18+, Rust 1.70+
- **Agent**: Go 1.21+ (or pre-built binary)
- **Network**: UDP multicast support on LAN

## Limitations

- University testing only - not production ready
- Self-signed certificates trigger browser warnings
- Basic rate limiting implemented
- No persistent service installation scripts included