use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    cmp::Ordering,
    collections::{HashMap, VecDeque},
    net::Ipv4Addr,
    net::SocketAddr,
    process::Command,
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
const HEARTBEAT_TIMEOUT_MS: i64 = 20_000;
const DEVICE_EMIT_THROTTLE_MS: i64 = 1_000;
const DEVICE_ACTIVITY_RATE_MS: i64 = 5_000;
const ACTIVITY_DEDUPE_MS: i64 = 30_000;
const MAX_LOGS: usize = 400;
const MAX_ACTIVITY: usize = 200;

const EVENT_SERVER_STATUS: &str = "server_status";
const EVENT_DEVICES_SNAPSHOT: &str = "devices_snapshot";
const EVENT_DEVICE_UPSERT: &str = "device_upsert";
const EVENT_DEVICE_REMOVE: &str = "device_remove";
const EVENT_LOG: &str = "log_event";
const EVENT_TASK_UPDATE: &str = "task_update";
const EVENT_ACTIVITY: &str = "activity_event";
const EVENT_TOPOLOGY_SNAPSHOT: &str = "topology_snapshot";
const EVENT_TOPOLOGY_CHANGED: &str = "topology_changed";

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
    pub version: String,
    pub status: String,
    pub last_seen_ms: i64,
    pub internet_reachable: Option<bool>,
    pub dns_ok: Option<bool>,
    pub gateway_reachable: Option<bool>,
    pub latency_ms: Option<i64>,
    pub last_internet_change_ms: Option<i64>,
    pub last_dns_change_ms: Option<i64>,
    pub first_seen_ms: i64,
    pub ip: Option<String>,
    pub subnet_cidr: Option<String>,
    pub default_gateway_ip: Option<String>,
    pub interface_type: Option<String>,
    pub mac: Option<String>,
    pub gateway_mac: Option<String>,
    pub dhcp_server_ip: Option<String>,
    pub ssid: Option<String>,
    #[serde(default)]
    pub arp_snapshot: Vec<ArpEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevicesSnapshot {
    pub devices: Vec<DeviceRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopologySnapshot {
    pub revision: u64,
    pub updated_at: i64,
    pub nodes: Vec<TopologyNode>,
    pub edges: Vec<TopologyEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopologyNode {
    pub id: String,
    pub node_type: String,
    pub label: String,
    pub subnet_cidr: Option<String>,
    pub gateway_ip: Option<String>,
    pub agent_id: Option<String>,
    pub interface_type: Option<String>,
    pub attached_count: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopologyEdge {
    pub id: String,
    pub child_id: String,
    pub parent_id: String,
    pub method: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArpEntry {
    pub ip: String,
    pub mac: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NetworkFactsPayload {
    pub ip: String,
    pub subnet_cidr: String,
    pub default_gateway_ip: String,
    pub interface_type: String,
    pub mac: Option<String>,
    pub gateway_mac: Option<String>,
    pub dhcp_server_ip: Option<String>,
    pub ssid: Option<String>,
    #[serde(default)]
    pub arp_snapshot: Vec<ArpEntry>,
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
pub struct ActivityEvent {
    pub id: String,
    pub kind: String,
    pub agent_id: Option<String>,
    pub message: String,
    pub ts: i64,
    pub count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivitySnapshot {
    pub events: Vec<ActivityEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LogEvent {
    pub id: String,
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
    version: String,
    #[serde(default)]
    network: NetworkFactsPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HeartbeatPayload {
    status: String,
    last_seen: i64,
    metrics: Option<Value>,
    #[serde(default)]
    network: NetworkFactsPayload,
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
    device_order: Vec<String>,
    tasks: HashMap<String, TaskRecord>,
    logs: VecDeque<LogEvent>,
    activity: VecDeque<ActivityEvent>,
    connections: HashMap<String, mpsc::UnboundedSender<Message>>,
    last_device_emit_ms: HashMap<String, i64>,
    last_activity_emit_ms: HashMap<String, i64>,
    topology_snapshot: TopologySnapshot,
    topology_key: String,
    admin_network: NetworkFactsPayload,
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
                device_order: Vec::new(),
                tasks: HashMap::new(),
                logs: VecDeque::new(),
                activity: VecDeque::new(),
                connections: HashMap::new(),
                last_device_emit_ms: HashMap::new(),
                last_activity_emit_ms: HashMap::new(),
                topology_snapshot: TopologySnapshot {
                    revision: 0,
                    updated_at: now_ms(),
                    nodes: Vec::new(),
                    edges: Vec::new(),
                },
                topology_key: String::new(),
                admin_network: detect_admin_network_facts(),
            })),
        }
    }

    pub async fn start_runtime(&self, app: AppHandle) {
        let online = { self.inner.lock().await.online };
        if online {
            return;
        }

        self.rebuild_topology_if_changed(&app).await;

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
        let devices = {
            let state = self.inner.lock().await;
            state
                .device_order
                .iter()
                .filter_map(|id| state.devices.get(id).cloned())
                .collect::<Vec<_>>()
        };
        DevicesSnapshot { devices }
    }

    pub async fn get_topology_snapshot(&self) -> TopologySnapshot {
        let state = self.inner.lock().await;
        state.topology_snapshot.clone()
    }

    pub async fn get_tasks_snapshot(&self) -> TasksSnapshot {
        let mut tasks = {
            let state = self.inner.lock().await;
            state.tasks.values().cloned().collect::<Vec<_>>()
        };
        tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        TasksSnapshot { tasks }
    }

    pub async fn get_activity_snapshot(&self) -> ActivitySnapshot {
        let events = {
            let state = self.inner.lock().await;
            state.activity.iter().cloned().collect::<Vec<_>>()
        };
        ActivitySnapshot { events }
    }

    pub async fn get_pair_token(&self) -> String {
        self.inner.lock().await.pair_token.clone()
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
            self.inner
                .lock()
                .await
                .tasks
                .insert(task.task_id.clone(), task.clone());
        }

        let updated = self.dispatch_task_now(task).await;
        self.emit_task_update(&app, updated.clone()).await;
        self.emit_activity(
            &app,
            "task_started",
            None,
            format!("Task started: {} ({})", updated.kind, updated.task_id),
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
                tracing::error!("[WS] bind failed: {}", err);
                self.set_online(&app, false).await;
                self.emit_log(&app, None, "ERROR", format!("ws: bind failed: {}", err))
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
            format!("WS server listening on {}", bind_addr),
        )
        .await;

        let router = Router::new()
            .route("/ws/agent", get(ws_agent_handler))
            .with_state(HttpState {
                manager: self.clone(),
                app: app.clone(),
            });

        if let Err(err) = axum::serve(
            listener,
            router.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        {
            self.set_online(&app, false).await;
            self.emit_log(&app, None, "ERROR", format!("WS server stopped: {}", err))
                .await;
        }
    }

    async fn run_udp_provision_loop(&self, app: AppHandle) {
        let send_socket = match UdpSocket::bind("0.0.0.0:0").await {
            Ok(s) => s,
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

        let ack_socket = UdpSocket::bind(format!("0.0.0.0:{}", UDP_PORT)).await.ok();
        let admin_ip = detect_local_ipv4()
            .map(|ip| ip.to_string())
            .unwrap_or_else(|| "127.0.0.1".to_string());
        let destination = format!("255.255.255.255:{}", UDP_PORT);
        self.emit_log(
            &app,
            None,
            "INFO",
            format!(
                "provision: broadcasting on UDP {}, admin_ip={}",
                UDP_PORT, admin_ip
            ),
        )
        .await;

        let mut ack_buffer = [0_u8; 2048];
        loop {
            if !self.inner.lock().await.online {
                sleep(Duration::from_secs(1)).await;
                continue;
            }

            let secret = self.inner.lock().await.pair_token.clone();
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

            if let Some(socket) = &ack_socket {
                if let Ok(result) = tokio::time::timeout(
                    Duration::from_millis(300),
                    socket.recv_from(&mut ack_buffer),
                )
                .await
                {
                    if let Ok((len, sender)) = result {
                        if let Ok(ack) = serde_json::from_slice::<ProvisionAck>(&ack_buffer[..len])
                        {
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
            }
            sleep(Duration::from_secs(1)).await;
        }
    }

    async fn heartbeat_watchdog(&self, app: AppHandle) {
        loop {
            sleep(Duration::from_secs(3)).await;
            let now = now_ms();
            let mut ids = Vec::new();
            {
                let mut state = self.inner.lock().await;
                for d in state.devices.values_mut() {
                    if d.status != "offline" && now - d.last_seen_ms > HEARTBEAT_TIMEOUT_MS {
                        d.status = "offline".to_string();
                        ids.push(d.agent_id.clone());
                    }
                }
            }
            for id in ids {
                if let Some(device) = self.inner.lock().await.devices.get(&id).cloned() {
                    self.emit_device_upsert_if_needed(&app, device.clone(), true)
                        .await;
                    self.emit_activity(
                        &app,
                        "device_disconnected",
                        Some(id),
                        format!("{} disconnected (heartbeat timeout)", device.hostname),
                    )
                    .await;
                }
            }
        }
    }

    async fn dispatch_task_now(&self, task: TaskRecord) -> TaskRecord {
        let payload = TaskDispatchPayload {
            task_id: task.task_id.clone(),
            kind: task.kind.clone(),
            params: task.params.clone(),
        };
        let mut started = false;
        {
            let state = self.inner.lock().await;
            for agent in &task.assigned_agents {
                if let Some(sender) = state.connections.get(agent) {
                    let msg = WireMessage {
                        message_type: "task".to_string(),
                        ts: now_ms(),
                        agent_id: agent.clone(),
                        payload: serde_json::to_value(&payload).unwrap_or_else(|_| json!({})),
                    };
                    if let Ok(raw) = serde_json::to_string(&msg) {
                        let _ = sender.send(Message::Text(raw.into()));
                        started = true;
                    }
                }
            }
        }
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
    }

    async fn set_online(&self, app: &AppHandle, online: bool) {
        self.inner.lock().await.online = online;
        self.emit_server_status(app).await;
    }

    async fn emit_server_status(&self, app: &AppHandle) {
        let _ = app.emit(EVENT_SERVER_STATUS, self.get_status().await);
    }

    async fn emit_devices_snapshot(&self, app: &AppHandle) {
        let _ = app.emit(EVENT_DEVICES_SNAPSHOT, self.get_devices_snapshot().await);
    }

    async fn emit_topology_snapshot(&self, app: &AppHandle) {
        let snapshot = self.get_topology_snapshot().await;
        let _ = app.emit(EVENT_TOPOLOGY_SNAPSHOT, snapshot.clone());
        let _ = app.emit(EVENT_TOPOLOGY_CHANGED, snapshot);
    }

    async fn rebuild_topology_if_changed(&self, app: &AppHandle) {
        let changed = {
            let mut state = self.inner.lock().await;
            let candidate = build_topology_snapshot(
                &state.devices,
                &state.device_order,
                &state.admin_network,
                state.topology_snapshot.revision + 1,
            );
            let key = topology_key(&candidate);
            if key != state.topology_key {
                state.topology_key = key;
                state.topology_snapshot = candidate;
                true
            } else {
                false
            }
        };
        if changed {
            self.emit_topology_snapshot(app).await;
        }
    }

    async fn emit_device_upsert_if_needed(
        &self,
        app: &AppHandle,
        device: DeviceRecord,
        force: bool,
    ) {
        let now = now_ms();
        let should = {
            let mut state = self.inner.lock().await;
            let last = state
                .last_device_emit_ms
                .get(&device.agent_id)
                .copied()
                .unwrap_or(0);
            if force || now - last >= DEVICE_EMIT_THROTTLE_MS {
                state
                    .last_device_emit_ms
                    .insert(device.agent_id.clone(), now);
                true
            } else {
                false
            }
        };
        if should {
            let _ = app.emit(EVENT_DEVICE_UPSERT, DeviceUpsertEvent { device });
            self.emit_devices_snapshot(app).await;
        }
    }

    async fn emit_device_remove(&self, app: &AppHandle, agent_id: String) {
        let _ = app.emit(EVENT_DEVICE_REMOVE, DeviceRemoveEvent { agent_id });
        self.emit_devices_snapshot(app).await;
    }

    async fn emit_task_update(&self, app: &AppHandle, task: TaskRecord) {
        let _ = app.emit(EVENT_TASK_UPDATE, TaskUpdateEvent { task });
    }

    async fn emit_log(
        &self,
        app: &AppHandle,
        agent_id: Option<String>,
        level: &str,
        message: String,
    ) {
        let event = LogEvent {
            id: Uuid::new_v4().to_string(),
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

    async fn emit_activity(
        &self,
        app: &AppHandle,
        kind: &str,
        agent_id: Option<String>,
        message: String,
    ) {
        let now = now_ms();
        if let Some(ref id) = agent_id {
            let drop_event = {
                let state = self.inner.lock().await;
                now - state.last_activity_emit_ms.get(id).copied().unwrap_or(0)
                    < DEVICE_ACTIVITY_RATE_MS
            };
            if drop_event {
                return;
            }
        }

        let event = {
            let mut state = self.inner.lock().await;
            if let Some(ref id) = agent_id {
                state.last_activity_emit_ms.insert(id.clone(), now);
            }

            if let Some(front) = state.activity.front_mut() {
                if front.kind == kind
                    && front.agent_id == agent_id
                    && now - front.ts <= ACTIVITY_DEDUPE_MS
                {
                    front.ts = now;
                    front.count = Some(front.count.unwrap_or(1) + 1);
                    front.clone()
                } else {
                    let e = ActivityEvent {
                        id: Uuid::new_v4().to_string(),
                        kind: kind.to_string(),
                        agent_id,
                        message,
                        ts: now,
                        count: None,
                    };
                    state.activity.push_front(e.clone());
                    while state.activity.len() > MAX_ACTIVITY {
                        state.activity.pop_back();
                    }
                    e
                }
            } else {
                let e = ActivityEvent {
                    id: Uuid::new_v4().to_string(),
                    kind: kind.to_string(),
                    agent_id,
                    message,
                    ts: now,
                    count: None,
                };
                state.activity.push_front(e.clone());
                e
            }
        };

        let _ = app.emit(EVENT_ACTIVITY, event);
    }

    async fn on_agent_disconnect(&self, app: &AppHandle, agent_id: String) {
        let device = {
            let mut state = self.inner.lock().await;
            state.connections.remove(&agent_id);
            if let Some(d) = state.devices.get_mut(&agent_id) {
                d.status = "offline".to_string();
                d.last_seen_ms = now_ms();
                Some(d.clone())
            } else {
                None
            }
        };

        if let Some(device) = device {
            self.emit_device_upsert_if_needed(app, device.clone(), true)
                .await;
            self.emit_activity(
                app,
                "device_disconnected",
                Some(device.agent_id.clone()),
                format!("{} disconnected", device.hostname),
            )
            .await;
        } else {
            self.emit_device_remove(app, agent_id).await;
        }
        self.rebuild_topology_if_changed(app).await;
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
            Ok(m) => m,
            Err(_) => break,
        };
        let text = match message {
            Message::Text(t) => t,
            _ => continue,
        };

        let wire = match serde_json::from_str::<WireMessage>(&text) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if wire.message_type == "register" {
            let payload = match serde_json::from_value::<RegisterPayload>(wire.payload) {
                Ok(v) => v,
                Err(_) => continue,
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

            let response = if secret_ok {
                json!({"ok": true, "server_time": now_ms()})
            } else {
                json!({"ok": false, "error": "invalid shared secret", "server_time": now_ms()})
            };

            let _ = tx.send(Message::Text(
                json!({
                    "type": "registered",
                    "ts": now_ms(),
                    "agent_id": payload.agent_id,
                    "payload": response
                })
                .to_string()
                .into(),
            ));

            if !secret_ok {
                break;
            }

            let now = now_ms();
            let (device, was_new, old_status) = {
                let mut guard = state.manager.inner.lock().await;
                guard
                    .connections
                    .insert(payload.agent_id.clone(), tx.clone());
                let was_new = !guard.devices.contains_key(&payload.agent_id);
                if was_new {
                    guard.device_order.push(payload.agent_id.clone());
                }

                let entry = guard
                    .devices
                    .entry(payload.agent_id.clone())
                    .or_insert(DeviceRecord {
                        agent_id: payload.agent_id.clone(),
                        hostname: payload.hostname.clone(),
                        ips: payload.ips.clone(),
                        os: payload.os.clone(),
                        version: payload.version.clone(),
                        status: "online".to_string(),
                        last_seen_ms: now,
                        internet_reachable: None,
                        dns_ok: None,
                        gateway_reachable: None,
                        latency_ms: None,
                        last_internet_change_ms: None,
                        last_dns_change_ms: None,
                        first_seen_ms: now,
                        ip: None,
                        subnet_cidr: None,
                        default_gateway_ip: None,
                        interface_type: None,
                        mac: None,
                        gateway_mac: None,
                        dhcp_server_ip: None,
                        ssid: None,
                        arp_snapshot: Vec::new(),
                    });

                let old_status = entry.status.clone();
                entry.hostname = payload.hostname;
                entry.ips = payload.ips;
                entry.os = payload.os;
                entry.version = payload.version;
                entry.status = "online".to_string();
                entry.last_seen_ms = now;
                apply_network_payload(entry, &payload.network);
                (entry.clone(), was_new, old_status)
            };

            registered_agent_id = Some(device.agent_id.clone());
            state
                .manager
                .emit_device_upsert_if_needed(&state.app, device.clone(), true)
                .await;

            if was_new {
                state
                    .manager
                    .emit_activity(
                        &state.app,
                        "device_connected",
                        Some(device.agent_id.clone()),
                        format!("{} connected", device.hostname),
                    )
                    .await;
            }
            if old_status != "online" {
                state
                    .manager
                    .emit_activity(
                        &state.app,
                        "device_status_changed",
                        Some(device.agent_id.clone()),
                        format!("{} status {} -> online", device.hostname, old_status),
                    )
                    .await;
            }
            state.manager.rebuild_topology_if_changed(&state.app).await;
            continue;
        }

        let agent_id = match &registered_agent_id {
            Some(id) => id.clone(),
            None => continue,
        };

        match wire.message_type.as_str() {
            "heartbeat" => {
                if let Ok(payload) = serde_json::from_value::<HeartbeatPayload>(wire.payload) {
                    tracing::debug!("[WS] heartbeat agent_id={}", agent_id);
                    let now = now_ms();
                    let (device_opt, status_changed, internet_changed, dns_changed) = {
                        let mut guard = state.manager.inner.lock().await;
                        if let Some(device) = guard.devices.get_mut(&agent_id) {
                            let old_status = device.status.clone();
                            let old_internet = device.internet_reachable;
                            let old_dns = device.dns_ok;

                            device.last_seen_ms = if payload.last_seen > 0 {
                                payload.last_seen
                            } else {
                                now
                            };
                            if !payload.status.is_empty() {
                                device.status = payload.status;
                            }
                            if let Some(metrics) = payload.metrics {
                                if let Some(v) = metrics.get("internet_reachable") {
                                    device.internet_reachable = v.as_bool();
                                }
                                if let Some(v) = metrics.get("dns_ok") {
                                    device.dns_ok = v.as_bool();
                                }
                                if let Some(v) = metrics.get("gateway_reachable") {
                                    device.gateway_reachable = v.as_bool();
                                }
                                if let Some(v) = metrics.get("latency_ms") {
                                    device.latency_ms = v.as_i64();
                                }
                            }

                            apply_network_payload(device, &payload.network);

                            let status_changed = if old_status != device.status {
                                Some((old_status, device.status.clone()))
                            } else {
                                None
                            };

                            let internet_changed = if old_internet != device.internet_reachable {
                                device.last_internet_change_ms = Some(now);
                                Some((old_internet, device.internet_reachable))
                            } else {
                                None
                            };

                            let dns_changed = if old_dns != device.dns_ok {
                                device.last_dns_change_ms = Some(now);
                                Some((old_dns, device.dns_ok))
                            } else {
                                None
                            };

                            (
                                Some(device.clone()),
                                status_changed,
                                internet_changed,
                                dns_changed,
                            )
                        } else {
                            (None, None, None, None)
                        }
                    };

                    if let Some(device) = device_opt {
                        state
                            .manager
                            .emit_device_upsert_if_needed(&state.app, device.clone(), false)
                            .await;

                        if let Some((old, new)) = status_changed {
                            state
                                .manager
                                .emit_activity(
                                    &state.app,
                                    "device_status_changed",
                                    Some(device.agent_id.clone()),
                                    format!("{} status {} -> {}", device.hostname, old, new),
                                )
                                .await;
                        }
                        if let Some((old, new)) = internet_changed {
                            state
                                .manager
                                .emit_log(
                                    &state.app,
                                    Some(device.agent_id.clone()),
                                    "INFO",
                                    format!("internet_reachable changed {:?} -> {:?}", old, new),
                                )
                                .await;
                            state
                                .manager
                                .emit_activity(
                                    &state.app,
                                    "internet_status_changed",
                                    Some(device.agent_id.clone()),
                                    format!("{} internet {:?} -> {:?}", device.hostname, old, new),
                                )
                                .await;
                        }
                        if let Some((old, new)) = dns_changed {
                            state
                                .manager
                                .emit_log(
                                    &state.app,
                                    Some(device.agent_id.clone()),
                                    "INFO",
                                    format!("dns_ok changed {:?} -> {:?}", old, new),
                                )
                                .await;
                            state
                                .manager
                                .emit_activity(
                                    &state.app,
                                    "dns_status_changed",
                                    Some(device.agent_id.clone()),
                                    format!("{} dns {:?} -> {:?}", device.hostname, old, new),
                                )
                                .await;
                        }
                        state.manager.rebuild_topology_if_changed(&state.app).await;
                    }
                }
            }
            "task_result" => {
                if let Ok(payload) = serde_json::from_value::<TaskResultPayload>(wire.payload) {
                    let maybe_task = {
                        let mut guard = state.manager.inner.lock().await;
                        if let Some(task) = guard.tasks.get_mut(&payload.task_id) {
                            task.results.retain(|r| r.agent_id != agent_id);
                            task.results.push(TaskResultRecord {
                                agent_id: agent_id.clone(),
                                ok: payload.ok,
                                result: payload.result,
                                error: payload.error,
                                ts: now_ms(),
                            });
                            if task.results.len() == task.assigned_agents.len() {
                                task.ended_at = Some(now_ms());
                                task.status = if task.results.iter().all(|r| r.ok) {
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
                        state
                            .manager
                            .emit_task_update(&state.app, task.clone())
                            .await;
                        let kind = if task.status == "failed" {
                            "task_failed"
                        } else if task.status == "done" {
                            "task_completed"
                        } else {
                            "task_started"
                        };
                        state
                            .manager
                            .emit_activity(
                                &state.app,
                                kind,
                                Some(agent_id),
                                format!("Task {} status {}", task.task_id, task.status),
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
            .on_agent_disconnect(&state.app, agent_id)
            .await;
    }
}

fn apply_network_payload(device: &mut DeviceRecord, network: &NetworkFactsPayload) {
    let ip = clean_non_empty_owned(&network.ip).or_else(|| {
        device
            .ips
            .iter()
            .find_map(|candidate| clean_non_empty_owned(candidate))
    });
    device.ip = ip;
    device.subnet_cidr = clean_non_empty_owned(&network.subnet_cidr)
        .or_else(|| device.ip.as_deref().and_then(guess_subnet_from_ip));
    device.default_gateway_ip = clean_non_empty_owned(&network.default_gateway_ip);
    device.interface_type = clean_non_empty_owned(&network.interface_type);
    device.mac = network.mac.clone().and_then(|v| clean_non_empty_owned(&v));
    device.gateway_mac = network
        .gateway_mac
        .clone()
        .and_then(|v| clean_non_empty_owned(&v));
    device.dhcp_server_ip = network
        .dhcp_server_ip
        .clone()
        .and_then(|v| clean_non_empty_owned(&v));
    device.ssid = network.ssid.clone().and_then(|v| clean_non_empty_owned(&v));
    if !network.arp_snapshot.is_empty() {
        device.arp_snapshot = network.arp_snapshot.clone();
    }
}

fn build_topology_snapshot(
    devices: &HashMap<String, DeviceRecord>,
    device_order: &[String],
    admin_network: &NetworkFactsPayload,
    revision: u64,
) -> TopologySnapshot {
    let mut nodes: Vec<TopologyNode> = Vec::new();
    let mut edges: Vec<TopologyEdge> = Vec::new();

    let mut host_records: Vec<DeviceRecord> = device_order
        .iter()
        .filter_map(|id| devices.get(id).cloned())
        .collect();
    host_records.sort_by(compare_device_topology_order);

    let admin_ip = clean_non_empty_owned(&admin_network.ip)
        .or_else(detect_local_ipv4_string)
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let admin_subnet = clean_non_empty_owned(&admin_network.subnet_cidr)
        .or_else(|| guess_subnet_from_ip(&admin_ip));
    let admin_gateway = clean_non_empty_owned(&admin_network.default_gateway_ip);

    let mut gateway_by_key: HashMap<String, String> = HashMap::new();
    let mut subnet_nodes: HashMap<String, String> = HashMap::new();
    let mut gateway_specs: Vec<(String, Option<String>)> = Vec::new();
    let mut attachment_count: HashMap<String, usize> = HashMap::new();

    let mut observed_subnets: Vec<String> = host_records
        .iter()
        .filter_map(|d| d.subnet_cidr.clone())
        .collect();
    if let Some(s) = admin_subnet.clone() {
        observed_subnets.push(s);
    }
    observed_subnets.sort();
    observed_subnets.dedup();
    let use_subnet_nodes = observed_subnets.len() > 1;

    if use_subnet_nodes {
        for subnet in &observed_subnets {
            let subnet_id = format!("subnet:{}", subnet);
            subnet_nodes.insert(subnet.clone(), subnet_id.clone());
            nodes.push(TopologyNode {
                id: subnet_id,
                node_type: "subnet".to_string(),
                label: subnet.clone(),
                subnet_cidr: Some(subnet.clone()),
                gateway_ip: None,
                agent_id: None,
                interface_type: None,
                attached_count: None,
            });
        }
    }

    if let Some(gw) = admin_gateway.clone() {
        gateway_specs.push((gw, admin_subnet.clone()));
    }
    for host in &host_records {
        if let Some(gw) = host
            .default_gateway_ip
            .clone()
            .and_then(|v| clean_non_empty_owned(&v))
        {
            gateway_specs.push((gw, host.subnet_cidr.clone()));
        }
    }
    gateway_specs.sort_by(|a, b| {
        let subnet_cmp = a.1.cmp(&b.1);
        if subnet_cmp != Ordering::Equal {
            return subnet_cmp;
        }
        let a_ip = ip_to_u32(&a.0);
        let b_ip = ip_to_u32(&b.0);
        match (a_ip, b_ip) {
            (Some(x), Some(y)) if x != y => x.cmp(&y),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            _ => a.0.cmp(&b.0),
        }
    });
    gateway_specs.dedup();

    for (gateway_ip, subnet) in gateway_specs {
        let subnet_key = subnet.clone().unwrap_or_default();
        let key = format!("{}|{}", subnet_key, gateway_ip);
        let gateway_id = format!("gw:{}", gateway_ip);
        gateway_by_key.insert(key, gateway_id.clone());
        nodes.push(TopologyNode {
            id: gateway_id.clone(),
            node_type: "gateway".to_string(),
            label: format!("Gateway {}", gateway_ip),
            subnet_cidr: subnet.clone(),
            gateway_ip: Some(gateway_ip.clone()),
            agent_id: None,
            interface_type: None,
            attached_count: None,
        });

        if use_subnet_nodes {
            if let Some(subnet_value) = subnet {
                if let Some(subnet_id) = subnet_nodes.get(&subnet_value) {
                    edges.push(TopologyEdge {
                        id: format!("{}->{}", gateway_id, subnet_id),
                        child_id: gateway_id,
                        parent_id: subnet_id.clone(),
                        method: "evidence".to_string(),
                        confidence: 1.0,
                    });
                }
            }
        }
    }

    let mut unknown_hub_ids: HashMap<String, String> = HashMap::new();

    let admin_id = "admin:self".to_string();
    nodes.push(TopologyNode {
        id: admin_id.clone(),
        node_type: "admin".to_string(),
        label: "Admin".to_string(),
        subnet_cidr: admin_subnet.clone(),
        gateway_ip: admin_gateway.clone(),
        agent_id: None,
        interface_type: clean_non_empty_owned(&admin_network.interface_type),
        attached_count: None,
    });
    let admin_parent = if let Some(gw) = admin_gateway.clone() {
        let key = format!("{}|{}", admin_subnet.clone().unwrap_or_default(), gw);
        let parent_id = gateway_by_key
            .get(&key)
            .cloned()
            .unwrap_or_else(|| format!("gw:{}", gw));
        (parent_id, "evidence".to_string(), 0.9)
    } else {
        (
            ensure_unknown_hub_node(
                &mut nodes,
                &mut edges,
                &subnet_nodes,
                &mut unknown_hub_ids,
                admin_subnet.clone(),
                use_subnet_nodes,
            ),
            "heuristic".to_string(),
            0.5,
        )
    };
    edges.push(TopologyEdge {
        id: format!("{}->{}", admin_id, admin_parent.0),
        child_id: admin_id,
        parent_id: admin_parent.0.clone(),
        method: admin_parent.1,
        confidence: admin_parent.2,
    });
    *attachment_count.entry(admin_parent.0).or_insert(0) += 1;

    for host in host_records {
        let node_id = format!("host:{}", host.agent_id);
        nodes.push(TopologyNode {
            id: node_id.clone(),
            node_type: "host".to_string(),
            label: host.hostname.clone(),
            subnet_cidr: host.subnet_cidr.clone(),
            gateway_ip: host.default_gateway_ip.clone(),
            agent_id: Some(host.agent_id.clone()),
            interface_type: host.interface_type.clone(),
            attached_count: None,
        });

        let (parent_id, method, confidence) = if let Some(gw) = host
            .default_gateway_ip
            .clone()
            .and_then(|v| clean_non_empty_owned(&v))
        {
            let key = format!("{}|{}", host.subnet_cidr.clone().unwrap_or_default(), gw);
            let parent_id = gateway_by_key
                .get(&key)
                .cloned()
                .unwrap_or_else(|| format!("gw:{}", gw));
            (parent_id, "evidence".to_string(), 0.9)
        } else {
            (
                ensure_unknown_hub_node(
                    &mut nodes,
                    &mut edges,
                    &subnet_nodes,
                    &mut unknown_hub_ids,
                    host.subnet_cidr.clone(),
                    use_subnet_nodes,
                ),
                "heuristic".to_string(),
                0.45,
            )
        };

        edges.push(TopologyEdge {
            id: format!("{}->{}", node_id, parent_id),
            child_id: node_id,
            parent_id: parent_id.clone(),
            method,
            confidence,
        });
        *attachment_count.entry(parent_id).or_insert(0) += 1;
    }

    for node in &mut nodes {
        if node.node_type == "gateway" || node.node_type == "unknown_hub" {
            node.attached_count = Some(*attachment_count.get(&node.id).unwrap_or(&0));
        }
    }

    nodes.sort_by(compare_topology_nodes);
    edges.sort_by(|a, b| {
        let child = a.child_id.cmp(&b.child_id);
        if child != Ordering::Equal {
            return child;
        }
        a.parent_id.cmp(&b.parent_id)
    });

    TopologySnapshot {
        revision,
        updated_at: now_ms(),
        nodes,
        edges,
    }
}

fn ensure_unknown_hub_node(
    nodes: &mut Vec<TopologyNode>,
    edges: &mut Vec<TopologyEdge>,
    subnet_nodes: &HashMap<String, String>,
    unknown_hub_ids: &mut HashMap<String, String>,
    subnet: Option<String>,
    use_subnet_nodes: bool,
) -> String {
    let subnet_key = subnet.clone().unwrap_or_else(|| "unknown".to_string());
    if let Some(existing) = unknown_hub_ids.get(&subnet_key) {
        return existing.clone();
    }

    let hub_id = format!("hub:{}", subnet_key);
    nodes.push(TopologyNode {
        id: hub_id.clone(),
        node_type: "unknown_hub".to_string(),
        label: "Unknown Hub".to_string(),
        subnet_cidr: subnet.clone(),
        gateway_ip: None,
        agent_id: None,
        interface_type: None,
        attached_count: None,
    });

    if use_subnet_nodes {
        if let Some(subnet_value) = subnet {
            if let Some(subnet_id) = subnet_nodes.get(&subnet_value) {
                edges.push(TopologyEdge {
                    id: format!("{}->{}", hub_id, subnet_id),
                    child_id: hub_id.clone(),
                    parent_id: subnet_id.clone(),
                    method: "heuristic".to_string(),
                    confidence: 0.5,
                });
            }
        }
    }

    unknown_hub_ids.insert(subnet_key, hub_id.clone());
    hub_id
}

fn compare_device_topology_order(a: &DeviceRecord, b: &DeviceRecord) -> Ordering {
    let a_ip =
        a.ip.as_deref()
            .or_else(|| a.ips.first().map(String::as_str))
            .and_then(ip_to_u32);
    let b_ip =
        b.ip.as_deref()
            .or_else(|| b.ips.first().map(String::as_str))
            .and_then(ip_to_u32);
    match (a_ip, b_ip) {
        (Some(x), Some(y)) if x != y => x.cmp(&y),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        _ => {
            let host_cmp = a.hostname.cmp(&b.hostname);
            if host_cmp != Ordering::Equal {
                host_cmp
            } else {
                a.agent_id.cmp(&b.agent_id)
            }
        }
    }
}

fn compare_topology_nodes(a: &TopologyNode, b: &TopologyNode) -> Ordering {
    let rank = |node_type: &str| match node_type {
        "subnet" => 0,
        "gateway" => 1,
        "switch" => 2,
        "unknown_hub" => 3,
        "admin" => 4,
        "host" => 5,
        _ => 6,
    };
    let r = rank(&a.node_type).cmp(&rank(&b.node_type));
    if r != Ordering::Equal {
        return r;
    }

    let a_ip = a
        .gateway_ip
        .as_deref()
        .and_then(ip_to_u32)
        .or_else(|| ip_to_u32(&a.label));
    let b_ip = b
        .gateway_ip
        .as_deref()
        .and_then(ip_to_u32)
        .or_else(|| ip_to_u32(&b.label));
    match (a_ip, b_ip) {
        (Some(x), Some(y)) if x != y => x.cmp(&y),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        _ => a.id.cmp(&b.id),
    }
}

fn topology_key(snapshot: &TopologySnapshot) -> String {
    let mut node_parts: Vec<String> = snapshot
        .nodes
        .iter()
        .map(|n| {
            format!(
                "{}|{}|{}|{}",
                n.id,
                n.node_type,
                n.subnet_cidr.clone().unwrap_or_default(),
                n.gateway_ip.clone().unwrap_or_default()
            )
        })
        .collect();
    node_parts.sort();
    let mut edge_parts: Vec<String> = snapshot
        .edges
        .iter()
        .map(|e| format!("{}|{}|{}", e.child_id, e.parent_id, e.method))
        .collect();
    edge_parts.sort();
    format!("{}#{}", node_parts.join(";"), edge_parts.join(";"))
}

fn detect_admin_network_facts() -> NetworkFactsPayload {
    let ip = detect_local_ipv4_string().unwrap_or_else(|| "127.0.0.1".to_string());
    let default_gateway_ip = detect_default_gateway_ip().unwrap_or_default();
    let subnet_cidr = guess_subnet_from_ip(&ip).unwrap_or_else(|| "127.0.0.0/24".to_string());

    NetworkFactsPayload {
        ip,
        subnet_cidr,
        default_gateway_ip,
        interface_type: detect_interface_type(),
        mac: None,
        gateway_mac: None,
        dhcp_server_ip: None,
        ssid: detect_ssid(),
        arp_snapshot: Vec::new(),
    }
}

fn detect_local_ipv4_string() -> Option<String> {
    detect_local_ipv4().map(|ip| ip.to_string())
}

fn detect_default_gateway_ip() -> Option<String> {
    if cfg!(target_os = "windows") {
        let out = command_output("route", &["print", "-4"])?;
        for line in out.lines() {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() >= 3
                && fields[0] == "0.0.0.0"
                && fields[1] == "0.0.0.0"
                && ip_to_u32(fields[2]).is_some()
            {
                return Some(fields[2].to_string());
            }
        }
    }

    if cfg!(target_os = "linux") {
        let out = command_output("ip", &["route", "show", "default"])?;
        let parts: Vec<&str> = out.split_whitespace().collect();
        for i in 0..parts.len().saturating_sub(1) {
            if parts[i] == "via" && ip_to_u32(parts[i + 1]).is_some() {
                return Some(parts[i + 1].to_string());
            }
        }
    }
    None
}

fn detect_interface_type() -> String {
    if cfg!(target_os = "windows") {
        if let Some(out) = command_output("netsh", &["wlan", "show", "interfaces"]) {
            let lower = out.to_lowercase();
            if lower.contains("ssid") && !lower.contains("there is no wireless interface") {
                return "wifi".to_string();
            }
        }
    }
    "ethernet".to_string()
}

fn detect_ssid() -> Option<String> {
    if !cfg!(target_os = "windows") {
        return None;
    }
    let out = command_output("netsh", &["wlan", "show", "interfaces"])?;
    for line in out.lines() {
        let trimmed = line.trim();
        let lower = trimmed.to_lowercase();
        if lower.starts_with("ssid") && !lower.starts_with("bssid") {
            let parts: Vec<&str> = trimmed.splitn(2, ':').collect();
            if parts.len() == 2 {
                let ssid = parts[1].trim();
                if !ssid.is_empty() {
                    return Some(ssid.to_string());
                }
            }
        }
    }
    None
}

fn command_output(command: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(command).args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8(out.stdout).ok()
}

fn clean_non_empty_owned(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn guess_subnet_from_ip(ip: &str) -> Option<String> {
    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() == 4 {
        Some(format!("{}.{}.{}.0/24", parts[0], parts[1], parts[2]))
    } else {
        None
    }
}

fn ip_to_u32(value: &str) -> Option<u32> {
    let ip: Ipv4Addr = value.parse().ok()?;
    Some(u32::from(ip))
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
