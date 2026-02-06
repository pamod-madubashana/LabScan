use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, VecDeque},
    sync::Arc,
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use tokio::{
    net::TcpListener,
    sync::{mpsc, Mutex},
    time::sleep,
};
use uuid::Uuid;

const STATE_EVENT: &str = "labscan://state";
const MAX_LOGS: usize = 400;
const EMIT_DEBOUNCE_MS: i64 = 250;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WireMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    pub ts: i64,
    pub agent_id: String,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterPayload {
    pub agent_id: String,
    pub secret: String,
    pub hostname: String,
    pub ips: Vec<String>,
    pub os: String,
    pub arch: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatPayload {
    pub status: String,
    pub last_seen: i64,
    pub metrics: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResultPayload {
    pub task_id: String,
    pub ok: bool,
    pub result: Value,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentLogPayload {
    pub level: String,
    pub message: String,
    pub context: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDispatchPayload {
    pub task_id: String,
    pub kind: String,
    pub params: Value,
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
pub struct LogRecord {
    pub id: String,
    pub ts: i64,
    pub level: String,
    pub agent_id: Option<String>,
    pub message: String,
    pub context: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsRecord {
    pub bind_addr: String,
    pub port: u16,
    pub shared_secret: String,
    pub heartbeat_timeout_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub running: bool,
    pub bind_addr: String,
    pub port: u16,
    pub connected_agents: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateSnapshot {
    pub server: ServerStatus,
    pub settings: SettingsRecord,
    pub devices: Vec<DeviceRecord>,
    pub tasks: Vec<TaskRecord>,
    pub logs: Vec<LogRecord>,
}

#[derive(Clone)]
pub struct ServerManager {
    inner: Arc<Mutex<RuntimeState>>,
}

#[derive(Debug)]
struct RuntimeState {
    settings: SettingsRecord,
    devices: HashMap<String, DeviceRecord>,
    tasks: HashMap<String, TaskRecord>,
    logs: VecDeque<LogRecord>,
    connections: HashMap<String, mpsc::UnboundedSender<Message>>,
    task_queue_by_agent: HashMap<String, VecDeque<String>>,
    running: bool,
    emit_scheduled: bool,
    last_emit_ms: i64,
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
                settings: SettingsRecord {
                    bind_addr: "0.0.0.0".to_string(),
                    port: 8787,
                    shared_secret: "labscan-dev-secret".to_string(),
                    heartbeat_timeout_secs: 20,
                },
                devices: HashMap::new(),
                tasks: HashMap::new(),
                logs: VecDeque::new(),
                connections: HashMap::new(),
                task_queue_by_agent: HashMap::new(),
                running: false,
                emit_scheduled: false,
                last_emit_ms: 0,
            })),
        }
    }

    pub async fn start_server(
        &self,
        app: AppHandle,
        requested_port: Option<u16>,
    ) -> Result<ServerStatus, String> {
        let (bind_addr, port, already_running) = {
            let mut state = self.inner.lock().await;
            if let Some(port) = requested_port {
                state.settings.port = port;
            }

            let status = (
                state.settings.bind_addr.clone(),
                state.settings.port,
                state.running,
            );

            if !state.running {
                state.running = true;
            }

            status
        };

        if already_running {
            return Ok(self.get_status().await);
        }

        let addr = format!("{}:{}", bind_addr, port);
        let listener = TcpListener::bind(&addr)
            .await
            .map_err(|err| format!("failed to bind {}: {}", addr, err))?;

        self.append_log("INFO", None, format!("Admin server listening on {}", addr), None)
            .await;

        let http_state = HttpState {
            manager: self.clone(),
            app: app.clone(),
        };

        let router = Router::new()
            .route("/ws/agent", get(ws_agent_handler))
            .route("/api/devices", get(api_devices))
            .route("/api/tasks", get(api_tasks).post(api_create_task))
            .route("/api/logs", get(api_logs))
            .route("/api/settings", get(api_settings))
            .with_state(http_state.clone());

        tokio::spawn(async move {
            if let Err(err) = axum::serve(listener, router).await {
                tracing::error!("admin server stopped: {}", err);
                http_state
                    .manager
                    .append_log(
                        "ERROR",
                        None,
                        format!("Admin server stopped unexpectedly: {}", err),
                        None,
                    )
                    .await;
            }
        });

        let watchdog = self.clone();
        tokio::spawn(async move {
            watchdog.heartbeat_watchdog(app).await;
        });

        self.schedule_state_emit(app).await;
        Ok(self.get_status().await)
    }

    pub async fn get_status(&self) -> ServerStatus {
        let state = self.inner.lock().await;
        ServerStatus {
            running: state.running,
            bind_addr: state.settings.bind_addr.clone(),
            port: state.settings.port,
            connected_agents: state.connections.len(),
        }
    }

    pub async fn get_snapshot(&self) -> StateSnapshot {
        let state = self.inner.lock().await;

        let mut devices = state.devices.values().cloned().collect::<Vec<_>>();
        devices.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));

        let mut tasks = state.tasks.values().cloned().collect::<Vec<_>>();
        tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        let logs = state.logs.iter().cloned().collect::<Vec<_>>();

        StateSnapshot {
            server: ServerStatus {
                running: state.running,
                bind_addr: state.settings.bind_addr.clone(),
                port: state.settings.port,
                connected_agents: state.connections.len(),
            },
            settings: state.settings.clone(),
            devices,
            tasks,
            logs,
        }
    }

    pub async fn update_shared_secret(&self, app: AppHandle, secret: String) -> Result<(), String> {
        if secret.trim().is_empty() {
            return Err("shared secret cannot be empty".to_string());
        }

        {
            let mut state = self.inner.lock().await;
            state.settings.shared_secret = secret;
        }

        self.append_log(
            "INFO",
            None,
            "Shared secret updated from UI".to_string(),
            None,
        )
        .await;
        self.schedule_state_emit(app).await;
        Ok(())
    }

    pub async fn generate_pair_token(&self) -> String {
        Uuid::new_v4().to_string()
    }

    pub async fn create_task(
        &self,
        app: AppHandle,
        kind: String,
        agent_ids: Vec<String>,
        params: Value,
    ) -> Result<TaskRecord, String> {
        if agent_ids.is_empty() {
            return Err("at least one agent is required".to_string());
        }

        if !matches!(kind.as_str(), "ping" | "port_scan" | "arp_snapshot") {
            return Err("unsupported task kind".to_string());
        }

        let task = TaskRecord {
            task_id: Uuid::new_v4().to_string(),
            kind,
            params,
            assigned_agents: agent_ids,
            status: "queued".to_string(),
            created_at: now_ms(),
            started_at: None,
            ended_at: None,
            results: Vec::new(),
        };

        {
            let mut state = self.inner.lock().await;
            state.tasks.insert(task.task_id.clone(), task.clone());

            for agent_id in &task.assigned_agents {
                state
                    .task_queue_by_agent
                    .entry(agent_id.clone())
                    .or_default()
                    .push_back(task.task_id.clone());
            }
        }

        self.dispatch_task_to_assigned_agents(task.clone()).await;

        self.append_log(
            "INFO",
            None,
            format!(
                "Task queued: kind={} agents={} id={}",
                task.kind,
                task.assigned_agents.len(),
                task.task_id
            ),
            None,
        )
        .await;

        self.schedule_state_emit(app).await;
        Ok(task)
    }

    async fn dispatch_task_to_assigned_agents(&self, task: TaskRecord) {
        let payload = TaskDispatchPayload {
            task_id: task.task_id.clone(),
            kind: task.kind.clone(),
            params: task.params.clone(),
        };

        let mut started = false;
        let mut state = self.inner.lock().await;

        for agent_id in &task.assigned_agents {
            if let Some(sender) = state.connections.get(agent_id) {
                let outgoing = WireMessage {
                    message_type: "task".to_string(),
                    ts: now_ms(),
                    agent_id: agent_id.clone(),
                    payload: serde_json::to_value(&payload).unwrap_or_else(|_| json!({})),
                };

                let text = serde_json::to_string(&outgoing).unwrap_or_else(|_| "{}".to_string());
                let _ = sender.send(Message::Text(text.into()));
                started = true;
            }
        }

        if let Some(entry) = state.tasks.get_mut(&task.task_id) {
            if started {
                entry.status = "running".to_string();
                entry.started_at = Some(now_ms());
            }
        }
    }

    async fn heartbeat_watchdog(&self, app: AppHandle) {
        loop {
            sleep(Duration::from_secs(5)).await;

            let timeout_secs = {
                let state = self.inner.lock().await;
                if !state.running {
                    continue;
                }
                state.settings.heartbeat_timeout_secs
            };

            let now = now_ms();
            let timeout_ms = (timeout_secs as i64) * 1_000;

            let mut changed = false;
            {
                let mut state = self.inner.lock().await;
                for device in state.devices.values_mut() {
                    if now - device.last_seen > timeout_ms && device.status != "unreachable" {
                        device.status = "unreachable".to_string();
                        device.connected = false;
                        changed = true;
                    }
                }
            }

            if changed {
                self.schedule_state_emit(app.clone()).await;
            }
        }
    }

    async fn append_log(
        &self,
        level: &str,
        agent_id: Option<String>,
        message: String,
        context: Option<Value>,
    ) {
        let mut state = self.inner.lock().await;
        let record = LogRecord {
            id: Uuid::new_v4().to_string(),
            ts: now_ms(),
            level: level.to_string(),
            agent_id,
            message,
            context,
        };

        state.logs.push_front(record);
        while state.logs.len() > MAX_LOGS {
            state.logs.pop_back();
        }
    }

    async fn schedule_state_emit(&self, app: AppHandle) {
        let delay_ms = {
            let mut state = self.inner.lock().await;
            let now = now_ms();
            let elapsed = now - state.last_emit_ms;

            if elapsed >= EMIT_DEBOUNCE_MS {
                state.last_emit_ms = now;
                None
            } else if state.emit_scheduled {
                return;
            } else {
                state.emit_scheduled = true;
                Some((EMIT_DEBOUNCE_MS - elapsed) as u64)
            }
        };

        if let Some(delay_ms) = delay_ms {
            let manager = self.clone();
            tokio::spawn(async move {
                sleep(Duration::from_millis(delay_ms)).await;
                {
                    let mut state = manager.inner.lock().await;
                    state.emit_scheduled = false;
                    state.last_emit_ms = now_ms();
                }
                manager.emit_snapshot(&app).await;
            });
        } else {
            self.emit_snapshot(&app).await;
        }
    }

    async fn emit_snapshot(&self, app: &AppHandle) {
        let snapshot = self.get_snapshot().await;
        if let Err(err) = app.emit(STATE_EVENT, snapshot) {
            tracing::warn!("failed to emit state event: {}", err);
        }
    }

    async fn handle_agent_disconnect(&self, app: AppHandle, agent_id: &str) {
        {
            let mut state = self.inner.lock().await;
            state.connections.remove(agent_id);
            if let Some(device) = state.devices.get_mut(agent_id) {
                device.connected = false;
                device.status = "unreachable".to_string();
                device.last_seen = now_ms();
            }
        }

        self.append_log(
            "WARN",
            Some(agent_id.to_string()),
            "Agent disconnected".to_string(),
            None,
        )
        .await;
        self.schedule_state_emit(app).await;
    }
}

pub async fn ws_agent_handler(ws: WebSocketUpgrade, State(state): State<HttpState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_agent_socket(socket, state))
}

async fn handle_agent_socket(socket: WebSocket, state: HttpState) {
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
                tracing::warn!("agent websocket receive error: {}", err);
                break;
            }
        };

        if let Message::Text(text) = message {
            let parsed = serde_json::from_str::<WireMessage>(&text);
            let incoming = match parsed {
                Ok(value) => value,
                Err(_) => continue,
            };

            if incoming.message_type == "register" {
                let register_payload = serde_json::from_value::<RegisterPayload>(incoming.payload);
                let register_payload = match register_payload {
                    Ok(payload) => payload,
                    Err(_) => {
                        let _ = tx.send(Message::Text(
                            json!({
                                "type": "registered",
                                "ts": now_ms(),
                                "agent_id": incoming.agent_id,
                                "payload": {"ok": false, "error": "invalid register payload", "server_time": now_ms()}
                            })
                            .to_string()
                            .into(),
                        ));
                        continue;
                    }
                };

                let secret_ok = {
                    let state_guard = state.manager.inner.lock().await;
                    register_payload.secret == state_guard.settings.shared_secret
                };

                if !secret_ok {
                    let _ = tx.send(Message::Text(
                        json!({
                            "type": "registered",
                            "ts": now_ms(),
                            "agent_id": register_payload.agent_id,
                            "payload": {"ok": false, "error": "invalid shared secret", "server_time": now_ms()}
                        })
                        .to_string()
                        .into(),
                    ));
                    break;
                }

                {
                    let mut state_guard = state.manager.inner.lock().await;
                    state_guard
                        .connections
                        .insert(register_payload.agent_id.clone(), tx.clone());

                    state_guard.devices.insert(
                        register_payload.agent_id.clone(),
                        DeviceRecord {
                            agent_id: register_payload.agent_id.clone(),
                            hostname: register_payload.hostname,
                            ips: register_payload.ips,
                            os: register_payload.os,
                            arch: register_payload.arch,
                            version: register_payload.version,
                            status: "online".to_string(),
                            last_seen: now_ms(),
                            connected: true,
                            last_metrics: None,
                        },
                    );
                }

                let registered = json!({
                    "type": "registered",
                    "ts": now_ms(),
                    "agent_id": register_payload.agent_id,
                    "payload": {
                        "ok": true,
                        "server_time": now_ms(),
                        "agent_config": {"heartbeat_interval_secs": 8}
                    }
                });

                let _ = tx.send(Message::Text(registered.to_string().into()));
                registered_agent_id = Some(incoming.agent_id.clone());

                state
                    .manager
                    .append_log(
                        "INFO",
                        Some(incoming.agent_id.clone()),
                        "Agent registered".to_string(),
                        None,
                    )
                    .await;
                state.manager.schedule_state_emit(state.app.clone()).await;
                continue;
            }

            let agent_id = match &registered_agent_id {
                Some(id) => id.clone(),
                None => continue,
            };

            match incoming.message_type.as_str() {
                "heartbeat" => {
                    if let Ok(payload) = serde_json::from_value::<HeartbeatPayload>(incoming.payload) {
                        {
                            let mut state_guard = state.manager.inner.lock().await;
                            if let Some(device) = state_guard.devices.get_mut(&agent_id) {
                                device.last_seen = now_ms();
                                device.connected = true;
                                device.status = payload.status;
                                device.last_metrics = payload.metrics;
                            }
                        }
                        state.manager.schedule_state_emit(state.app.clone()).await;
                    }
                }
                "task_result" => {
                    if let Ok(payload) = serde_json::from_value::<TaskResultPayload>(incoming.payload) {
                        {
                            let mut state_guard = state.manager.inner.lock().await;
                            if let Some(task) = state_guard.tasks.get_mut(&payload.task_id) {
                                task.results.retain(|existing| existing.agent_id != agent_id);
                                task.results.push(TaskResultRecord {
                                    agent_id: agent_id.clone(),
                                    ok: payload.ok,
                                    result: payload.result,
                                    error: payload.error.clone(),
                                    ts: now_ms(),
                                });

                                if task.results.len() == task.assigned_agents.len() {
                                    task.ended_at = Some(now_ms());
                                    task.status = if task.results.iter().all(|result| result.ok) {
                                        "done".to_string()
                                    } else {
                                        "failed".to_string()
                                    };
                                }
                            }
                        }

                        state
                            .manager
                            .append_log(
                                if payload.ok { "INFO" } else { "ERROR" },
                                Some(agent_id.clone()),
                                format!("Task result received for {}", payload.task_id),
                                payload.error.map(|error| json!({ "error": error })),
                            )
                            .await;

                        state.manager.schedule_state_emit(state.app.clone()).await;
                    }
                }
                "log" => {
                    if let Ok(payload) = serde_json::from_value::<AgentLogPayload>(incoming.payload) {
                        state
                            .manager
                            .append_log(
                                &payload.level,
                                Some(agent_id.clone()),
                                payload.message,
                                payload.context,
                            )
                            .await;
                        state.manager.schedule_state_emit(state.app.clone()).await;
                    }
                }
                _ => {}
            }
        }
    }

    write_task.abort();
    if let Some(agent_id) = registered_agent_id {
        state
            .manager
            .handle_agent_disconnect(state.app.clone(), &agent_id)
            .await;
    }
}

async fn api_devices(State(state): State<HttpState>) -> impl IntoResponse {
    let snapshot = state.manager.get_snapshot().await;
    Json(snapshot.devices)
}

async fn api_tasks(State(state): State<HttpState>) -> impl IntoResponse {
    let snapshot = state.manager.get_snapshot().await;
    Json(snapshot.tasks)
}

async fn api_logs(State(state): State<HttpState>) -> impl IntoResponse {
    let snapshot = state.manager.get_snapshot().await;
    Json(snapshot.logs)
}

async fn api_settings(State(state): State<HttpState>) -> impl IntoResponse {
    let snapshot = state.manager.get_snapshot().await;
    Json(snapshot.settings)
}

#[derive(Debug, Deserialize)]
struct CreateTaskRequest {
    kind: String,
    assigned_agents: Vec<String>,
    params: Value,
}

async fn api_create_task(
    State(state): State<HttpState>,
    Json(request): Json<CreateTaskRequest>,
) -> impl IntoResponse {
    match state
        .manager
        .create_task(state.app.clone(), request.kind, request.assigned_agents, request.params)
        .await
    {
        Ok(task) => (StatusCode::OK, Json(task)).into_response(),
        Err(err) => (StatusCode::BAD_REQUEST, Json(json!({ "error": err }))).into_response(),
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
