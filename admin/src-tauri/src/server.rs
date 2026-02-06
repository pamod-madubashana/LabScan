use axum::{
    extract::{
        ConnectInfo,
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, VecDeque},
    net::SocketAddr,
    sync::Arc,
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use tokio::{
    net::{TcpListener, UdpSocket},
    sync::{mpsc, Mutex},
    time::sleep,
};
use uuid::Uuid;

const WS_PORT: u16 = 8148;
const UDP_PORT: u16 = 8870;
const HEARTBEAT_TIMEOUT_MS: i64 = 25_000;
const MAX_LOGS: usize = 400;

const EVENT_SERVER_STATUS: &str = "server_status";
const EVENT_DEVICES_SNAPSHOT: &str = "devices_snapshot";
const EVENT_DEVICE_UPSERT: &str = "device_upsert";
const EVENT_DEVICE_REMOVE: &str = "device_remove";
const EVENT_LOG: &str = "log_event";
const EVENT_TASK_UPDATE: &str = "task_update";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub online: bool,
    pub port_ws: u16,
    pub port_udp: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceRecord {
    pub agent_id: String,
    pub hostname: String,
    pub ips: Vec<String>,
    pub os: String,
    pub arch: String,
    pub version: String,
    pub status: String,
    pub last_seen: i64,
    pub connected: bool,
    pub last_metrics: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevicesSnapshot {
    pub devices: Vec<DeviceRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResultRecord {
    pub agent_id: String,
    pub ok: bool,
    pub result: Value,
    pub error: Option<String>,
    pub ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRecord {
    pub task_id: String,
    pub kind: String,
    pub params: Value,
    pub assigned_agents: Vec<String>,
    pub status: String,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub results: Vec<TaskResultRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TasksSnapshot {
    pub tasks: Vec<TaskRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LogEvent {
    pub agent_id: Option<String>,
    pub level: String,
    pub message: String,
    pub ts: i64,
}

#[derive(Debug, Clone, Serialize)]
struct DeviceUpsertEvent {
    device: DeviceRecord,
}

#[derive(Debug, Clone, Serialize)]
struct DeviceRemoveEvent {
    agent_id: String,
}

#[derive(Debug, Clone, Serialize)]
struct TaskUpdateEvent {
    task: TaskRecord,
}

#[derive(Debug, Clone, Serialize)]
struct ProvisionBroadcast {
    #[serde(rename = "type")]
    message_type: String,
    v: u8,
    admin_ip: String,
    secret: String,
    nonce: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ProvisionAck {
    #[serde(rename = "type")]
    message_type: String,
    v: u8,
    agent_id: String,
    hostname: String,
    nonce: String,
    ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WireMessage {
    #[serde(rename = "type")]
    message_type: String,
    ts: i64,
    agent_id: String,
    payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RegisterPayload {
    agent_id: String,
    secret: String,
    hostname: String,
    ips: Vec<String>,
    os: String,
    arch: String,
    version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HeartbeatPayload {
    status: String,
    last_seen: i64,
    metrics: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TaskResultPayload {
    task_id: String,
    ok: bool,
    result: Value,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TaskDispatchPayload {
    task_id: String,
    kind: String,
    params: Value,
}

#[derive(Debug)]
struct RuntimeState {
    online: bool,
    pair_token: String,
    devices: HashMap<String, DeviceRecord>,
    tasks: HashMap<String, TaskRecord>,
    logs: VecDeque<LogEvent>,
    connections: HashMap<String, mpsc::UnboundedSender<Message>>,
}

#[derive(Clone)]
pub struct ServerManager {
    inner: Arc<Mutex<RuntimeState>>,
}

#[derive(Clone)]
struct HttpState {
    manager: ServerManager,
    app: AppHandle,
}

impl ServerManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(RuntimeState {
                online: false,
                pair_token: Uuid::new_v4().to_string(),
                devices: HashMap::new(),
                tasks: HashMap::new(),
                logs: VecDeque::new(),
                connections: HashMap::new(),
            })),
        }
    }

    pub async fn start_runtime(&self, app: AppHandle) {
        let already_online = {
            let state = self.inner.lock().await;
            state.online
        };
        if already_online {
            return;
        }

        let manager = self.clone();
        let app_for_ws = app.clone();
        tokio::spawn(async move {
            manager.run_ws_server(app_for_ws).await;
        });

        let manager = self.clone();
        let app_for_udp = app.clone();
        tokio::spawn(async move {
            manager.run_udp_provision_loop(app_for_udp).await;
        });

        let manager = self.clone();
        let app_for_watchdog = app.clone();
        tokio::spawn(async move {
            manager.heartbeat_watchdog(app_for_watchdog).await;
        });
    }

    pub async fn get_status(&self) -> ServerStatus {
        let state = self.inner.lock().await;
        ServerStatus {
            online: state.online,
            port_ws: WS_PORT,
            port_udp: UDP_PORT,
        }
    }

    pub async fn get_devices_snapshot(&self) -> DevicesSnapshot {
        let mut devices = {
            let state = self.inner.lock().await;
            state.devices.values().cloned().collect::<Vec<_>>()
        };
        devices.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
        DevicesSnapshot { devices }
    }

    pub async fn get_tasks_snapshot(&self) -> TasksSnapshot {
        let mut tasks = {
            let state = self.inner.lock().await;
            state.tasks.values().cloned().collect::<Vec<_>>()
        };
        tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        TasksSnapshot { tasks }
    }

    pub async fn get_pair_token(&self) -> String {
        let state = self.inner.lock().await;
        state.pair_token.clone()
    }

    pub async fn rotate_pair_token(&self, app: AppHandle) -> Result<String, String> {
        let token = {
            let mut state = self.inner.lock().await;
            state.pair_token = Uuid::new_v4().to_string();
            state.pair_token.clone()
        };

        self.emit_server_status(&app).await;
        self.emit_log(&app, None, "INFO", "Pair token rotated".to_string())
            .await;
        Ok(token)
    }

    pub async fn dispatch_task(
        &self,
        app: AppHandle,
        agents: Vec<String>,
        kind: String,
        params: Value,
    ) -> Result<TaskRecord, String> {
        if agents.is_empty() {
            return Err("at least one agent is required".to_string());
        }
        if !matches!(kind.as_str(), "ping" | "port_scan" | "arp_snapshot") {
            return Err("unsupported task kind".to_string());
        }

        let task = TaskRecord {
            task_id: Uuid::new_v4().to_string(),
            kind,
            params,
            assigned_agents: agents,
            status: "queued".to_string(),
            created_at: now_ms(),
            started_at: None,
            ended_at: None,
            results: Vec::new(),
        };

        {
            let mut state = self.inner.lock().await;
            state.tasks.insert(task.task_id.clone(), task.clone());
        }

        let updated = self.dispatch_task_now(task).await;
        self.emit_task_update(&app, updated.clone()).await;
        self.emit_log(
            &app,
            None,
            "INFO",
            format!("Task dispatched: {} ({})", updated.kind, updated.task_id),
        )
        .await;
        Ok(updated)
    }

    async fn run_ws_server(&self, app: AppHandle) {
        let bind_addr = format!("0.0.0.0:{}", WS_PORT);
        tracing::info!("[WS] binding addr={}", bind_addr);
        self.emit_log(
            &app,
            None,
            "INFO",
            format!("Starting WS server on {}", bind_addr),
        )
        .await;

        let listener = match TcpListener::bind(&bind_addr).await {
            Ok(listener) => listener,
            Err(err) => {
                tracing::error!("[WS] bind failed addr={} err={}", bind_addr, err);
                self.set_online(&app, false).await;
                self.emit_log(
                    &app,
                    None,
                    "ERROR",
                    format!("WS bind failed on {}: {}", bind_addr, err),
                )
                .await;
                return;
            }
        };

        self.set_online(&app, true).await;
        tracing::info!("[WS] listening addr={}", bind_addr);
        self.emit_log(
            &app,
            None,
            "INFO",
            format!("WS server listening on 0.0.0.0:{}", WS_PORT),
        )
        .await;

        let router = Router::new().route("/ws/agent", get(ws_agent_handler)).with_state(HttpState {
            manager: self.clone(),
            app: app.clone(),
        });

        if let Err(err) = axum::serve(listener, router.into_make_service_with_connect_info::<SocketAddr>()).await {
            self.set_online(&app, false).await;
            tracing::error!("[WS] server stopped err={}", err);
            self.emit_log(
                &app,
                None,
                "ERROR",
                format!("WS server stopped: {}", err),
            )
            .await;
        }
    }

    async fn run_udp_provision_loop(&self, app: AppHandle) {
        let send_socket = match UdpSocket::bind("0.0.0.0:0").await {
            Ok(socket) => socket,
            Err(err) => {
                self.emit_log(
                    &app,
                    None,
                    "ERROR",
                    format!("UDP broadcast socket error: {}", err),
                )
                .await;
                return;
            }
        };

        if let Err(err) = send_socket.set_broadcast(true) {
            self.emit_log(
                &app,
                None,
                "ERROR",
                format!("UDP broadcast enable failed: {}", err),
            )
            .await;
            return;
        }

        let ack_socket = match UdpSocket::bind(format!("0.0.0.0:{}", UDP_PORT)).await {
            Ok(socket) => socket,
            Err(err) => {
                self.emit_log(
                    &app,
                    None,
                    "WARN",
                    format!("UDP ack listener unavailable on {}: {}", UDP_PORT, err),
                )
                .await;
                self.broadcast_only_loop(&app, &send_socket).await;
                return;
            }
        };

        let admin_ip = detect_local_ipv4()
            .map(|ip| ip.to_string())
            .unwrap_or_else(|| "127.0.0.1".to_string());
        let destination = format!("255.255.255.255:{}", UDP_PORT);
        let mut ack_buffer = [0_u8; 2048];

        tracing::info!(
            "[PROVISION] broadcasting udp_port={} admin_ip={} destination={}",
            UDP_PORT,
            admin_ip,
            destination
        );
        self.emit_log(
            &app,
            None,
            "INFO",
            format!("provision: broadcasting on UDP {}, admin_ip={}", UDP_PORT, admin_ip),
        )
        .await;

        loop {
            let is_online = {
                let state = self.inner.lock().await;
                state.online
            };
            if !is_online {
                sleep(Duration::from_secs(1)).await;
                continue;
            }

            let secret = {
                let state = self.inner.lock().await;
                state.pair_token.clone()
            };

            let payload = ProvisionBroadcast {
                message_type: "LABSCAN_PROVISION".to_string(),
                v: 1,
                admin_ip: admin_ip.clone(),
                secret,
                nonce: Uuid::new_v4().to_string(),
            };

            if let Ok(raw) = serde_json::to_vec(&payload) {
                let _ = send_socket.send_to(&raw, &destination).await;
            }

            if let Ok(result) = tokio::time::timeout(
                Duration::from_millis(400),
                ack_socket.recv_from(&mut ack_buffer),
            )
            .await
            {
                if let Ok((len, sender)) = result {
                    if let Ok(ack) = serde_json::from_slice::<ProvisionAck>(&ack_buffer[..len]) {
                        if ack.message_type == "LABSCAN_PROVISION_ACK" && ack.v == 1 {
                            self.emit_log(
                                &app,
                                Some(ack.agent_id),
                                "INFO",
                                format!(
                                    "Provision ACK from {} ({}) nonce={} ts={}",
                                    ack.hostname, sender, ack.nonce, ack.ts
                                ),
                            )
                            .await;
                        }
                    }
                }
            }

            sleep(Duration::from_secs(1)).await;
        }
    }

    async fn broadcast_only_loop(&self, _app: &AppHandle, send_socket: &UdpSocket) {
        let admin_ip = detect_local_ipv4()
            .map(|ip| ip.to_string())
            .unwrap_or_else(|| "127.0.0.1".to_string());
        let destination = format!("255.255.255.255:{}", UDP_PORT);
        tracing::info!(
            "[PROVISION] broadcast-only mode udp_port={} admin_ip={} destination={}",
            UDP_PORT,
            admin_ip,
            destination
        );

        loop {
            let is_online = {
                let state = self.inner.lock().await;
                state.online
            };
            if !is_online {
                sleep(Duration::from_secs(1)).await;
                continue;
            }

            let secret = {
                let state = self.inner.lock().await;
                state.pair_token.clone()
            };

            let payload = ProvisionBroadcast {
                message_type: "LABSCAN_PROVISION".to_string(),
                v: 1,
                admin_ip: admin_ip.clone(),
                secret,
                nonce: Uuid::new_v4().to_string(),
            };

            if let Ok(raw) = serde_json::to_vec(&payload) {
                let _ = send_socket.send_to(&raw, &destination).await;
            }
            sleep(Duration::from_secs(1)).await;
        }
    }

    async fn heartbeat_watchdog(&self, app: AppHandle) {
        loop {
            sleep(Duration::from_secs(5)).await;

            let now = now_ms();
            let mut timed_out = Vec::new();

            {
                let mut state = self.inner.lock().await;
                for device in state.devices.values_mut() {
                    if device.connected && now - device.last_seen > HEARTBEAT_TIMEOUT_MS {
                        device.connected = false;
                        device.status = "offline".to_string();
                        timed_out.push(device.clone());
                    }
                }
                for device in &timed_out {
                    state.connections.remove(&device.agent_id);
                }
            }

            for device in timed_out {
                self.emit_device_upsert(&app, device.clone()).await;
                self.emit_log(
                    &app,
                    Some(device.agent_id),
                    "WARN",
                    "Agent heartbeat timeout, marked offline".to_string(),
                )
                .await;
            }

            if !self.inner.lock().await.online {
                self.emit_server_status(&app).await;
            }
        }
    }

    async fn dispatch_task_now(&self, task: TaskRecord) -> TaskRecord {
        let dispatch_payload = TaskDispatchPayload {
            task_id: task.task_id.clone(),
            kind: task.kind.clone(),
            params: task.params.clone(),
        };

        let mut started = false;
        {
            let state = self.inner.lock().await;
            for agent_id in &task.assigned_agents {
                if let Some(sender) = state.connections.get(agent_id) {
                    let outgoing = WireMessage {
                        message_type: "task".to_string(),
                        ts: now_ms(),
                        agent_id: agent_id.clone(),
                        payload: serde_json::to_value(&dispatch_payload).unwrap_or_else(|_| json!({})),
                    };

                    if let Ok(raw) = serde_json::to_string(&outgoing) {
                        let _ = sender.send(Message::Text(raw.into()));
                        started = true;
                    }
                }
            }
        }

        let updated = {
            let mut state = self.inner.lock().await;
            if let Some(existing) = state.tasks.get_mut(&task.task_id) {
                if started {
                    existing.status = "running".to_string();
                    existing.started_at = Some(now_ms());
                }
                existing.clone()
            } else {
                task
            }
        };

        updated
    }

    async fn set_online(&self, app: &AppHandle, online: bool) {
        {
            let mut state = self.inner.lock().await;
            state.online = online;
        }
        self.emit_server_status(app).await;
    }

    async fn emit_server_status(&self, app: &AppHandle) {
        let status = self.get_status().await;
        let _ = app.emit(EVENT_SERVER_STATUS, status);
    }

    async fn emit_devices_snapshot(&self, app: &AppHandle) {
        let snapshot = self.get_devices_snapshot().await;
        let _ = app.emit(EVENT_DEVICES_SNAPSHOT, snapshot);
    }

    async fn emit_device_upsert(&self, app: &AppHandle, device: DeviceRecord) {
        let _ = app.emit(EVENT_DEVICE_UPSERT, DeviceUpsertEvent { device });
        self.emit_devices_snapshot(app).await;
    }

    async fn emit_device_remove(&self, app: &AppHandle, agent_id: String) {
        let _ = app.emit(EVENT_DEVICE_REMOVE, DeviceRemoveEvent { agent_id });
        self.emit_devices_snapshot(app).await;
    }

    async fn emit_task_update(&self, app: &AppHandle, task: TaskRecord) {
        let _ = app.emit(EVENT_TASK_UPDATE, TaskUpdateEvent { task });
    }

    async fn emit_log(&self, app: &AppHandle, agent_id: Option<String>, level: &str, message: String) {
        let event = LogEvent {
            agent_id,
            level: level.to_string(),
            message,
            ts: now_ms(),
        };

        {
            let mut state = self.inner.lock().await;
            state.logs.push_front(event.clone());
            while state.logs.len() > MAX_LOGS {
                state.logs.pop_back();
            }
        }

        let _ = app.emit(EVENT_LOG, event);
    }

    async fn on_agent_disconnect(&self, app: &AppHandle, agent_id: String) {
        let maybe_device = {
            let mut state = self.inner.lock().await;
            state.connections.remove(&agent_id);
            if let Some(device) = state.devices.get_mut(&agent_id) {
                device.connected = false;
                device.status = "offline".to_string();
                device.last_seen = now_ms();
                Some(device.clone())
            } else {
                None
            }
        };

        if let Some(device) = maybe_device {
            self.emit_device_upsert(app, device).await;
            self.emit_log(app, Some(agent_id), "WARN", "Agent disconnected".to_string())
                .await;
        } else {
            self.emit_device_remove(app, agent_id).await;
        }
    }
}

async fn ws_agent_handler(
    ws: WebSocketUpgrade,
    ConnectInfo(remote): ConnectInfo<SocketAddr>,
    State(state): State<HttpState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_agent_socket(socket, state, remote))
}

async fn handle_agent_socket(socket: WebSocket, state: HttpState, remote: SocketAddr) {
    tracing::info!("[WS] connect remote={} path=/ws/agent", remote);
    state
        .manager
        .emit_log(
            &state.app,
            None,
            "INFO",
            format!("[WS] connect remote={} path=/ws/agent", remote),
        )
        .await;

    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let write_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    let mut registered_agent_id: Option<String> = None;

    while let Some(incoming) = receiver.next().await {
        let message = match incoming {
            Ok(message) => message,
            Err(err) => {
                tracing::warn!("[WS] receive error remote={} err={}", remote, err);
                state
                    .manager
                    .emit_log(
                        &state.app,
                        registered_agent_id.clone(),
                        "WARN",
                        format!("[WS] receive error remote={} err={}", remote, err),
                    )
                    .await;
                break;
            }
        };

        let text = match message {
            Message::Text(text) => text,
            _ => continue,
        };

        let parsed = serde_json::from_str::<WireMessage>(&text);
        let incoming = match parsed {
            Ok(value) => value,
            Err(_) => continue,
        };

        tracing::info!(
            "[WS] message remote={} type={} agent_id={}",
            remote,
            incoming.message_type,
            incoming.agent_id
        );

        if incoming.message_type == "register" {
            let payload = match serde_json::from_value::<RegisterPayload>(incoming.payload) {
                Ok(payload) => payload,
                Err(err) => {
                    tracing::warn!("[WS] register parse failed remote={} err={}", remote, err);
                    state
                        .manager
                        .emit_log(
                            &state.app,
                            None,
                            "WARN",
                            format!("[WS] register parse failed remote={} err={}", remote, err),
                        )
                        .await;
                    continue;
                }
            };

            let secret_ok = {
                let guard = state.manager.inner.lock().await;
                payload.secret == guard.pair_token
            };

            tracing::info!(
                "[WS] message type=register agent_id={} ok={}",
                payload.agent_id,
                secret_ok
            );
            state
                .manager
                .emit_log(
                    &state.app,
                    Some(payload.agent_id.clone()),
                    if secret_ok { "INFO" } else { "WARN" },
                    format!(
                        "[WS] message type=register agent_id={} ok={}",
                        payload.agent_id, secret_ok
                    ),
                )
                .await;

            let registered = if secret_ok {
                json!({"ok": true})
            } else {
                json!({"ok": false, "error": "invalid shared secret"})
            };
            let _ = tx.send(Message::Text(
                json!({
                    "type": "registered",
                    "ts": now_ms(),
                    "agent_id": payload.agent_id,
                    "payload": registered
                })
                .to_string()
                .into(),
            ));

            if !secret_ok {
                break;
            }

            let device = DeviceRecord {
                agent_id: payload.agent_id.clone(),
                hostname: payload.hostname,
                ips: payload.ips,
                os: payload.os,
                arch: payload.arch,
                version: payload.version,
                status: "online".to_string(),
                last_seen: now_ms(),
                connected: true,
                last_metrics: None,
            };

            {
                let mut guard = state.manager.inner.lock().await;
                guard.connections.insert(payload.agent_id.clone(), tx.clone());
                guard.devices.insert(payload.agent_id.clone(), device.clone());
            }

            tracing::info!("[WS] agent upserted agent_id={}", payload.agent_id);

            registered_agent_id = Some(payload.agent_id.clone());
            state.manager.emit_device_upsert(&state.app, device).await;
            state
                .manager
                .emit_log(
                    &state.app,
                    Some(payload.agent_id),
                    "INFO",
                    "Agent registered".to_string(),
                )
                .await;
            continue;
        }

        let agent_id = match &registered_agent_id {
            Some(id) => id.clone(),
            None => continue,
        };

        match incoming.message_type.as_str() {
            "heartbeat" => {
                if let Ok(payload) = serde_json::from_value::<HeartbeatPayload>(incoming.payload) {
                    tracing::info!("[WS] heartbeat agent_id={}", agent_id);
                    state
                        .manager
                        .emit_log(
                            &state.app,
                            Some(agent_id.clone()),
                            "DEBUG",
                            format!("[WS] heartbeat agent_id={}", agent_id),
                        )
                        .await;

                    let maybe_device = {
                        let mut guard = state.manager.inner.lock().await;
                        if let Some(device) = guard.devices.get_mut(&agent_id) {
                            device.last_seen = if payload.last_seen > 0 {
                                payload.last_seen
                            } else {
                                now_ms()
                            };
                            device.connected = true;
                            device.status = payload.status;
                            device.last_metrics = payload.metrics;
                            Some(device.clone())
                        } else {
                            None
                        }
                    };
                    if let Some(device) = maybe_device {
                        state.manager.emit_device_upsert(&state.app, device).await;
                    }
                }
            }
            "task_result" => {
                if let Ok(payload) = serde_json::from_value::<TaskResultPayload>(incoming.payload) {
                    let maybe_task = {
                        let mut guard = state.manager.inner.lock().await;
                        if let Some(task) = guard.tasks.get_mut(&payload.task_id) {
                            task.results.retain(|entry| entry.agent_id != agent_id);
                            task.results.push(TaskResultRecord {
                                agent_id: agent_id.clone(),
                                ok: payload.ok,
                                result: payload.result,
                                error: payload.error.clone(),
                                ts: now_ms(),
                            });

                            if task.results.len() == task.assigned_agents.len() {
                                task.ended_at = Some(now_ms());
                                task.status = if task.results.iter().all(|entry| entry.ok) {
                                    "done".to_string()
                                } else {
                                    "failed".to_string()
                                };
                            }
                            Some(task.clone())
                        } else {
                            None
                        }
                    };

                    if let Some(task) = maybe_task {
                        state.manager.emit_task_update(&state.app, task).await;
                        state
                            .manager
                            .emit_log(
                                &state.app,
                                Some(agent_id),
                                if payload.ok { "INFO" } else { "ERROR" },
                                format!("Task result received for {}", payload.task_id),
                            )
                            .await;
                    }
                }
            }
            _ => {}
        }
    }

    write_task.abort();
    if let Some(agent_id) = registered_agent_id {
        tracing::info!("[WS] disconnect agent_id={}", agent_id);
        state
            .manager
            .emit_log(
                &state.app,
                Some(agent_id.clone()),
                "INFO",
                format!("[WS] disconnect agent_id={}", agent_id),
            )
            .await;
        state.manager.on_agent_disconnect(&state.app, agent_id).await;
    } else {
        tracing::info!("[WS] disconnect remote={} agent_id=unknown", remote);
    }
}

fn detect_local_ipv4() -> Option<std::net::Ipv4Addr> {
    let udp = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    udp.connect("8.8.8.8:80").ok()?;
    match udp.local_addr().ok()?.ip() {
        std::net::IpAddr::V4(ip) => Some(ip),
        _ => None,
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
