# LabScan Agent

Headless Go service/daemon that connects to the LabScan admin server over websocket.

## Build

```bash
cd agent
go build -o labscan-agent.exe .
```

## Run

```bash
labscan-agent.exe -admin-url ws://192.168.1.20:8787/ws/agent -secret labscan-dev-secret
```

or just:

```bash
labscan-agent.exe
```

The first run creates `config.json` with persistent `agent_id`.

## Config file

`config.json` fields:

- `admin_url` - websocket URL to admin endpoint
- `agent_id` - stable UUID for this machine
- `secret` - shared secret used during register
- `heartbeat_interval_s` - heartbeat cadence
- `reconnect_min_ms` / `reconnect_max_ms` - reconnect backoff bounds

## Supported task kinds

- `ping` - TCP-connect latency check
- `port_scan` - timeout-based connect scan for explicit ports
- `arp_snapshot` - captures `arp -a` (Windows) or `ip neigh` (Linux)

Remote command execution is intentionally disabled.
