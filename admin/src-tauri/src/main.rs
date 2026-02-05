// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod server;
mod database;
mod discovery;

use discovery::{DiscoveryService, MDNSService};
use std::net::{Ipv4Addr, TcpStream};

use std::sync::Arc;
use tokio::sync::Mutex;
use tracing_subscriber;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let db = Arc::new(Mutex::new(database::init_database()?));
    let app_state = server::AppState { db };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            start_server,
            get_server_status,
            generate_join_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}

#[tauri::command]
async fn start_server(
    state: tauri::State<'_, server::AppState>,
    port: Option<u16>,
) -> Result<String, String> {
    let port = port.unwrap_or(8443);
    
    // Get local IP for discovery
    let local_ip = get_local_ip().map_err(|e| e.to_string())?;
    
    // Start HTTPS server
    let result = server::start_https_server(state.inner().clone(), port)
        .await
        .map_err(|e| e.to_string())?;
    
    // Start discovery services
    tokio::spawn(async move {
        if let Ok(discovery) = DiscoveryService::new(local_ip, "placeholder-fingerprint".to_string()).await {
            let _ = discovery.start_beacon("temp-token".to_string()).await;
        }
    });
    
    // Start mDNS
    if let Ok(mdns) = MDNSService::new() {
        let _ = mdns.advertise("LabScan-Admin", port, "placeholder-fingerprint");
    }
    
    Ok(result)
}

#[tauri::command]
async fn get_server_status() -> Result<server::ServerStatus, String> {
    server::get_status().await.map_err(|e| e.to_string())
}

fn get_local_ip() -> Result<Ipv4Addr, Box<dyn std::error::Error>> {
    // Connect to a remote address to determine local IP
    let stream = TcpStream::connect("8.8.8.8:80")?;
    let local_addr = stream.local_addr()?;
    if let std::net::IpAddr::V4(ipv4) = local_addr.ip() {
        Ok(ipv4)
    } else {
        Err("Not IPv4".into())
    }
}

#[tauri::command]
async fn generate_join_token(
    state: tauri::State<'_, server::AppState>,
    duration_minutes: Option<u32>,
) -> Result<String, String> {
    let duration = duration_minutes.unwrap_or(10);
    server::generate_token(state.inner().clone(), duration)
        .await
        .map_err(|e| e.to_string())
}