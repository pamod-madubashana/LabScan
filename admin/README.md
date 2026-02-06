# LabScan Admin (Tauri)

The admin desktop app embeds a Rust LAN server and a React UI.

## Start

```bash
cd admin
npm install
npm run tauri dev
```

## Embedded server

- Binds on `0.0.0.0:8787` by default.
- Agent websocket endpoint: `ws://<ADMIN_IP>:8787/ws/agent`
- HTTP API (for local inspection):
  - `GET /api/devices`
  - `GET /api/tasks`
  - `GET /api/logs`
  - `GET /api/settings`

The React UI receives live updates through Tauri events (`labscan://state`) emitted by the Rust backend.

## Pairing/auth

- Default secret: `labscan-dev-secret`
- Update it from **Settings** in the UI.
- Agents must send this secret in the `register` message.

## Windows firewall notes

Allow inbound TCP on port `8787` for the admin app so LAN agents can connect.
