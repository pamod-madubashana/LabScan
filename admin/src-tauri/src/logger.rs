fn format_context(context: Option<serde_json::Value>) -> String {
    match context {
        Some(value) if !value.is_null() => format!(" | context={}", value),
        _ => String::new(),
    }
}

#[tauri::command]
pub fn log_debug(message: String, context: Option<serde_json::Value>) {
    tracing::debug!("[React] {}{}", message, format_context(context));
}

#[tauri::command]
pub fn log_info(message: String, context: Option<serde_json::Value>) {
    tracing::info!("[React] {}{}", message, format_context(context));
}

#[tauri::command]
pub fn log_warn(message: String, context: Option<serde_json::Value>) {
    tracing::warn!("[React] {}{}", message, format_context(context));
}

#[tauri::command]
pub fn log_error(message: String, context: Option<serde_json::Value>) {
    tracing::error!("[React] {}{}", message, format_context(context));
}
