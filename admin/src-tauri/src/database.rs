use rusqlite::{params, Connection, Result};
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct Database {
    pub conn: Connection,
}

#[derive(Debug, serde::Serialize)]
pub struct Device {
    pub id: String,
    pub hostname: String,
    pub os: String,
    pub arch: String,
    pub agent_version: String,
    pub local_ip: String,
    pub mac_address: Option<String>,
    pub gateway_ip: Option<String>,
    pub dns_servers: Option<String>,
    pub registered_at: i64,
    pub last_seen: i64,
    pub is_online: bool,
}

#[derive(Debug, serde::Serialize)]
pub struct Heartbeat {
    pub id: String,
    pub device_id: String,
    pub timestamp: i64,
    pub gateway_reachable: bool,
    pub dns_resolves: bool,
    pub https_latency_ms: Option<i64>,
    pub local_ports: Option<String>,
}

impl Database {
    pub fn new(conn: Connection) -> Self {
        Self { conn }
    }

    pub fn create_tables(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS devices (
                id TEXT PRIMARY KEY,
                hostname TEXT NOT NULL,
                os TEXT NOT NULL,
                arch TEXT NOT NULL,
                agent_version TEXT NOT NULL,
                local_ip TEXT NOT NULL,
                mac_address TEXT,
                gateway_ip TEXT,
                dns_servers TEXT,
                registered_at INTEGER NOT NULL,
                last_seen INTEGER NOT NULL,
                is_online BOOLEAN NOT NULL DEFAULT 1
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS heartbeats (
                id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                gateway_reachable BOOLEAN NOT NULL,
                dns_resolves BOOLEAN NOT NULL,
                https_latency_ms INTEGER,
                local_ports TEXT,
                FOREIGN KEY(device_id) REFERENCES devices(id)
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                used BOOLEAN NOT NULL DEFAULT 0
            )",
            [],
        )?;

        Ok(())
    }

    pub fn register_device(&mut self, device: Device) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO devices 
            (id, hostname, os, arch, agent_version, local_ip, mac_address, 
             gateway_ip, dns_servers, registered_at, last_seen, is_online)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                device.id,
                device.hostname,
                device.os,
                device.arch,
                device.agent_version,
                device.local_ip,
                device.mac_address.unwrap_or_default(),
                device.gateway_ip.unwrap_or_default(),
                device.dns_servers.unwrap_or_default(),
                device.registered_at,
                device.last_seen,
                device.is_online,
            ],
        )?;
        Ok(())
    }

    pub fn record_heartbeat(&mut self, heartbeat: Heartbeat) -> Result<()> {
        self.conn.execute(
            "INSERT INTO heartbeats 
            (id, device_id, timestamp, gateway_reachable, dns_resolves, https_latency_ms, local_ports)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                heartbeat.id,
                heartbeat.device_id,
                heartbeat.timestamp,
                heartbeat.gateway_reachable,
                heartbeat.dns_resolves,
                heartbeat.https_latency_ms,
                heartbeat.local_ports.unwrap_or_default(),
            ],
        )?;
        Ok(())
    }

    pub fn update_device_last_seen(&mut self, device_id: &str, timestamp: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE devices SET last_seen = ?1, is_online = 1 WHERE id = ?2",
            params![timestamp, device_id],
        )?;
        Ok(())
    }

    pub fn get_all_devices(&self) -> Result<Vec<Device>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, hostname, os, arch, agent_version, local_ip, mac_address, 
                    gateway_ip, dns_servers, registered_at, last_seen, is_online 
             FROM devices ORDER BY last_seen DESC",
        )?;

        let device_iter = stmt.query_map([], |row| {
            Ok(Device {
                id: row.get(0)?,
                hostname: row.get(1)?,
                os: row.get(2)?,
                arch: row.get(3)?,
                agent_version: row.get(4)?,
                local_ip: row.get(5)?,
                mac_address: {
                    let mac: String = row.get(6)?;
                    if mac.is_empty() {
                        None
                    } else {
                        Some(mac)
                    }
                },
                gateway_ip: {
                    let gw: String = row.get(7)?;
                    if gw.is_empty() {
                        None
                    } else {
                        Some(gw)
                    }
                },
                dns_servers: {
                    let dns: String = row.get(8)?;
                    if dns.is_empty() {
                        None
                    } else {
                        Some(dns)
                    }
                },
                registered_at: row.get(9)?,
                last_seen: row.get(10)?,
                is_online: row.get(11)?,
            })
        })?;

        let mut devices = Vec::new();
        for device in device_iter {
            devices.push(device?);
        }
        Ok(devices)
    }
}

pub fn init_database() -> Result<Database> {
    let conn = Connection::open("labscan.db")?;
    let db = Database::new(conn);
    db.create_tables()?;
    Ok(db)
}

pub type DbPool = Arc<Mutex<Database>>;
