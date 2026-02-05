# LabScan Agent

## Building

```bash
# Build for current platform
go build -o labscan-agent

# Build for Windows
GOOS=windows GOARCH=amd64 go build -o labscan-agent.exe

# Build for Linux
GOOS=linux GOARCH=amd64 go build -o labscan-agent
```

## Running

### Auto-discovery mode (recommended):
```bash
./labscan-agent
```

The agent will:
1. Listen for UDP multicast beacons from the admin server
2. Automatically register when it discovers the admin
3. Begin sending periodic heartbeats

### Manual mode:
```bash
./labscan-agent -admin-url https://192.168.1.100:8443 -token YOUR_JOIN_TOKEN
```

## Configuration

The agent creates a `config.json` file with:
- Device ID (generated UUID)
- Admin server URL (from discovery or manual config)
- Join token (from discovery or manual config)
- TLS fingerprint (for security validation)

## Features

- **Zero-config discovery**: Clients automatically find the admin server
- **Secure registration**: Time-limited join tokens prevent unauthorized access
- **Network monitoring**: Tests gateway connectivity, DNS resolution, and HTTPS latency
- **Passive operation**: Agent only listens for beacons, doesn't actively scan networks
- **Cross-platform**: Works on Windows, Linux, and macOS