// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// #![windows_subsystem = "console"]

mod logger;
mod server;

use tauri::{AppHandle, Manager};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();
    tracing::info!("Tauri backend startup");

    let manager = server::ServerManager::new();

    tauri::Builder::default()
        .manage(manager)
        .setup(|app| {
            let app_handle = app.handle().clone();
            let manager = app.state::<server::ServerManager>().inner().clone();
            tauri::async_runtime::spawn(async move {
                manager.start_runtime(app_handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_server_status,
            get_devices_snapshot,
            get_topology_snapshot,
            get_tasks_snapshot,
            get_activity_snapshot,
            dispatch_task,
            get_pair_token,
            rotate_pair_token,
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
async fn get_server_status(
    state: tauri::State<'_, server::ServerManager>,
) -> Result<server::ServerStatus, String> {
    Ok(state.get_status().await)
}

#[tauri::command]
async fn get_devices_snapshot(
    state: tauri::State<'_, server::ServerManager>,
) -> Result<server::DevicesSnapshot, String> {
    Ok(state.get_devices_snapshot().await)
}

#[tauri::command]
async fn get_topology_snapshot(
    state: tauri::State<'_, server::ServerManager>,
) -> Result<server::TopologySnapshot, String> {
    Ok(state.get_topology_snapshot().await)
}

#[tauri::command]
async fn get_tasks_snapshot(
    state: tauri::State<'_, server::ServerManager>,
) -> Result<server::TasksSnapshot, String> {
    Ok(state.get_tasks_snapshot().await)
}

#[tauri::command]
async fn get_activity_snapshot(
    state: tauri::State<'_, server::ServerManager>,
) -> Result<server::ActivitySnapshot, String> {
    Ok(state.get_activity_snapshot().await)
}

#[tauri::command]
async fn dispatch_task(
    app: AppHandle,
    state: tauri::State<'_, server::ServerManager>,
    agents: Vec<String>,
    kind: String,
    params: serde_json::Value,
) -> Result<server::TaskRecord, String> {
    state.dispatch_task(app, agents, kind, params).await
}

#[tauri::command]
async fn get_pair_token(state: tauri::State<'_, server::ServerManager>) -> Result<String, String> {
    Ok(state.get_pair_token().await)
}

#[tauri::command]
async fn rotate_pair_token(
    app: AppHandle,
    state: tauri::State<'_, server::ServerManager>,
) -> Result<String, String> {
    state.rotate_pair_token(app).await
}
