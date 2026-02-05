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
- `/docs` - Documentation and diagrams

## Quick Start

```bash
# Start admin dashboard
cd admin
npm run tauri dev

# Build and run client agent
cd agent
go build -o labscan-agent
./labscan-agent
```