use crate::database::{DbPool, Device, Heartbeat};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
}

#[derive(Debug, Serialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
    pub tls_fingerprint: String,
    pub device_count: usize,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub join_token: String,
    pub device: DeviceInfo,
}

#[derive(Debug, Deserialize)]
pub struct DeviceInfo {
    pub hostname: String,
    pub os: String,
    pub arch: String,
    pub agent_version: String,
    pub local_ip: String,
    pub mac_address: Option<String>,
    pub gateway_ip: Option<String>,
    pub dns_servers: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct HeartbeatRequest {
    pub device_id: String,
    pub gateway_reachable: bool,
    pub dns_resolves: bool,
    pub https_latency_ms: Option<i64>,
    pub local_ports: Option<Vec<u16>>,
}

pub async fn start_https_server(state: AppState, port: u16) -> Result<String, Box<dyn std::error::Error>> {
    // Generate self-signed certificate
    let cert = rcgen::generate_simple_self_signed(vec!["localhost".to_string()])?;
    let cert_der = cert.cert.der().to_vec();
    let cert_pem = cert.cert.pem();
    let key_pem = cert.key_pair.serialize_pem();
    
    // Calculate fingerprint
    let fingerprint = Sha256::digest(&cert_der);
    let fingerprint_hex = hex::encode(fingerprint);

    // Save certificate for later use
    std::fs::create_dir_all("certs")?;
    std::fs::write("certs/cert.pem", &cert_pem)?;
    std::fs::write("certs/key.pem", &key_pem)?;

    let app = Router::new()
        .route("/api/v1/register", post(register_device))
        .route("/api/v1/heartbeat", post(record_heartbeat))
        .route("/api/v1/devices", get(list_devices))
        .route("/api/v1/devices/:id", get(get_device))
        .with_state(Arc::new(state));

    let addr: std::net::SocketAddr = format!("0.0.0.0:{}", port).parse()?;
    let rustls_config = axum_server::tls_rustls::RustlsConfig::from_pem_file("certs/cert.pem", "certs/key.pem").await?;
    
    tokio::spawn(async move {
        axum_server::bind_rustls(addr, rustls_config)
            .serve(app.into_make_service())
            .await
            .unwrap();
    });

    Ok(format!("Server started on https://0.0.0.0:{} with fingerprint: {}", port, fingerprint_hex))
}

pub async fn get_status() -> Result<ServerStatus, Box<dyn std::error::Error>> {
    // In a real implementation, you'd check if the server is actually running
    Ok(ServerStatus {
        running: true,
        port: 8443,
        tls_fingerprint: "placeholder".to_string(),
        device_count: 0,
    })
}

pub async fn generate_token(state: AppState, duration_minutes: u32) -> Result<String, Box<dyn std::error::Error>> {
    let token = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    let expires = now + (duration_minutes as i64 * 60);
    
    let mut db = state.db.lock().await;
    db.conn.execute(
        "INSERT INTO tokens (token, created_at, expires_at) VALUES (?1, ?2, ?3)",
        [&token, &now.to_string(), &expires.to_string()],
    )?;
    
    Ok(token)
}

async fn register_device(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RegisterRequest>,
) -> impl IntoResponse {
    // Validate token
    let mut db = state.db.lock().await;
    
    let token_valid: bool = db.conn.query_row(
        "SELECT COUNT(*) FROM tokens WHERE token = ?1 AND expires_at > ?2 AND used = 0",
        [&payload.join_token, &chrono::Utc::now().timestamp().to_string()],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

    if !token_valid {
        return (StatusCode::UNAUTHORIZED, "Invalid or expired token").into_response();
    }

    // Mark token as used
    db.conn.execute(
        "UPDATE tokens SET used = 1 WHERE token = ?1",
        [&payload.join_token],
    ).ok();

    // Register device
    let device_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    
    let device = Device {
        id: device_id.clone(),
        hostname: payload.device.hostname,
        os: payload.device.os,
        arch: payload.device.arch,
        agent_version: payload.device.agent_version,
        local_ip: payload.device.local_ip,
        mac_address: payload.device.mac_address,
        gateway_ip: payload.device.gateway_ip,
        dns_servers: payload.device.dns_servers,
        registered_at: now,
        last_seen: now,
        is_online: true,
    };

    match db.register_device(device) {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "device_id": device_id }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn record_heartbeat(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<HeartbeatRequest>,
) -> impl IntoResponse {
    let mut db = state.db.lock().await;
    let now = chrono::Utc::now().timestamp();
    
    let heartbeat = Heartbeat {
        id: Uuid::new_v4().to_string(),
        device_id: payload.device_id.clone(),
        timestamp: now,
        gateway_reachable: payload.gateway_reachable,
        dns_resolves: payload.dns_resolves,
        https_latency_ms: payload.https_latency_ms,
        local_ports: payload.local_ports.map(|ports| serde_json::to_string(&ports).unwrap_or_default()),
    };

    match db.record_heartbeat(heartbeat) {
        Ok(_) => {
            // Update device last seen
            db.update_device_last_seen(&payload.device_id, now).ok();
            StatusCode::OK.into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn list_devices(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.get_all_devices() {
        Ok(devices) => (StatusCode::OK, Json(devices)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_device(
    State(state): State<Arc<AppState>>,
    Path(device_id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    // Implementation for getting single device details
    (StatusCode::NOT_IMPLEMENTED, "Not implemented").into_response()
}
