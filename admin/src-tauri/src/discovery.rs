use serde::{Deserialize, Serialize};
use socket2::{Domain, Protocol, Socket, Type};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;
use tokio::net::UdpSocket;
use tokio::time;

const MULTICAST_GROUP: &str = "239.255.77.77";
const MULTICAST_PORT: u16 = 47777;
const BEACON_INTERVAL: Duration = Duration::from_secs(2);

#[derive(Debug, Serialize, Deserialize)]
pub struct BeaconPayload {
    #[serde(rename = "type")]
    pub beacon_type: String,
    pub version: String,
    pub admin_https_url: String,
    pub tls_fingerprint_sha256: String,
    pub join_token: String,
    pub issued_at_unix: i64,
}

pub struct DiscoveryService {
    socket: UdpSocket,
    admin_ip: Ipv4Addr,
    tls_fingerprint: String,
}

impl DiscoveryService {
    pub async fn new(admin_ip: Ipv4Addr, tls_fingerprint: String) -> Result<Self, Box<dyn std::error::Error>> {
        let socket = UdpSocket::bind(format!("0.0.0.0:{}", MULTICAST_PORT)).await?;
        
        let multi_addr = MULTICAST_GROUP.parse::<Ipv4Addr>()?;
        let interface = Ipv4Addr::UNSPECIFIED;
        
        socket.join_multicast_v4(&multi_addr, &interface)?;
        socket.set_multicast_loop_v4(true)?;
        
        Ok(Self {
            socket,
            admin_ip,
            tls_fingerprint,
        })
    }

    pub async fn start_beacon(&self, join_token: String) -> Result<(), Box<dyn std::error::Error>> {
        let multi_addr: Ipv4Addr = MULTICAST_GROUP.parse()?;
        let broadcast_addr = SocketAddr::new(IpAddr::V4(multi_addr), MULTICAST_PORT);
        
        let payload = BeaconPayload {
            beacon_type: "NETMON_ADMIN".to_string(),
            version: "1".to_string(),
            admin_https_url: format!("https://{}:8443", self.admin_ip),
            tls_fingerprint_sha256: self.tls_fingerprint.clone(),
            join_token,
            issued_at_unix: chrono::Utc::now().timestamp(),
        };

        let json_payload = serde_json::to_vec(&payload)?;
        
        loop {
            self.socket.send_to(&json_payload, broadcast_addr).await?;
            time::sleep(BEACON_INTERVAL).await;
        }
    }
}

// mDNS service advertisement
pub struct MDNSService {
    service: mdns_sd::ServiceDaemon,
}

impl MDNSService {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let service = mdns_sd::ServiceDaemon::new()?;
        Ok(Self { service })
    }

    pub fn advertise(&self, name: &str, port: u16, tls_fingerprint: &str) -> Result<(), Box<dyn std::error::Error>> {
        let service_type = "_netmon._tcp.local.";
        let hostname = format!("{}.{}", name, service_type);
        
        let my_service = mdns_sd::ServiceInfo::new(
            service_type,
            name,
            &hostname,
            "",
            port,
            Some(vec![
                format!("v=1"),
                format!("fp={}", tls_fingerprint),
                format!("name={}", name),
            ]),
        )?;

        self.service.register(my_service)?;
        Ok(())
    }
}