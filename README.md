# LabScan

LabScan is a LAN monitoring prototype with:

- `admin/` - Tauri desktop app (React UI + embedded Rust server)
- `agent/` - headless Go agent running on monitored machines

## MVP transport and protocol

- Transport: websocket (`/ws/agent`)
- Message shape: JSON envelope with `type`, `ts`, `agent_id`, `payload`
- Auth: shared secret in `register` payload

## Run the demo

### 1) Start admin

```bash
cd admin
npm install
npm run tauri dev
```

By default, the embedded server listens on `0.0.0.0:8787`.

### 2) Start one or more agents

```bash
cd agent
go build -o labscan-agent.exe .
labscan-agent.exe -admin-url ws://<ADMIN_IP>:8787/ws/agent -secret labscan-dev-secret
```

### 3) Verify flow in UI

1. Agent appears in **Devices**.
2. Select agent(s), dispatch `Ping`, `Port Scan`, or `ARP Snapshot`.
3. Observe progress/results in **Tasks** and live events in **Logs**.

## LAN/firewall notes (Windows)

- Allow inbound TCP port `8787` for the admin app.
- Agents need outbound TCP access to admin host on `8787`.

## Current scope

- In-memory runtime state (devices, tasks, logs, connections)
- Realtime UI updates via Tauri events (`labscan://state`)
- Agent reconnect with bounded exponential backoff
- No remote command execution (by design)
