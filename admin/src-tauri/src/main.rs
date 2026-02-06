// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod logger;
mod server;

use tauri::AppHandle;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();
    tracing::info!("Tauri backend startup");

    let manager = server::ServerManager::new();

    tauri::Builder::default()
        .manage(manager)
        .invoke_handler(tauri::generate_handler![
            start_server,
            get_server_status,
            get_state_snapshot,
            start_task,
            update_shared_secret,
            generate_pair_token,
            logger::log_debug,
            logger::log_info,
            logger::log_warn,
            logger::log_error
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}

#[tauri::command]
async fn start_server(
    app: AppHandle,
    state: tauri::State<'_, server::ServerManager>,
    port: Option<u16>,
) -> Result<server::ServerStatus, String> {
    state.start_server(app, port).await
}

#[tauri::command]
async fn get_server_status(
    state: tauri::State<'_, server::ServerManager>,
) -> Result<server::ServerStatus, String> {
    Ok(state.get_status().await)
}

#[tauri::command]
async fn get_state_snapshot(
    state: tauri::State<'_, server::ServerManager>,
) -> Result<server::StateSnapshot, String> {
    Ok(state.get_snapshot().await)
}

#[tauri::command]
async fn start_task(
    app: AppHandle,
    state: tauri::State<'_, server::ServerManager>,
    kind: String,
    agent_ids: Vec<String>,
    params: serde_json::Value,
) -> Result<server::TaskRecord, String> {
    state.create_task(app, kind, agent_ids, params).await
}

#[tauri::command]
async fn update_shared_secret(
    app: AppHandle,
    state: tauri::State<'_, server::ServerManager>,
    secret: String,
) -> Result<(), String> {
    state.update_shared_secret(app, secret).await
}

#[tauri::command]
async fn generate_pair_token(
    state: tauri::State<'_, server::ServerManager>,
) -> Result<String, String> {
    Ok(state.generate_pair_token().await)
}
