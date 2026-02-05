import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Device {
  id: string;
  hostname: string;
  os: string;
  arch: string;
  agent_version: string;
  local_ip: string;
  mac_address?: string;
  gateway_ip?: string;
  dns_servers?: string;
  registered_at: number;
  last_seen: number;
  is_online: boolean;
}

interface ServerStatus {
  running: boolean;
  port: number;
  tls_fingerprint: string;
  device_count: number;
}

function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [joinToken, setJoinToken] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadDevices();
    loadServerStatus();
    
    // Refresh every 5 seconds
    const interval = setInterval(() => {
      loadDevices();
      loadServerStatus();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const loadDevices = async () => {
    try {
      const response = await fetch('https://localhost:8443/api/v1/devices');
      if (response.ok) {
        const data = await response.json();
        setDevices(data);
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const loadServerStatus = async () => {
    try {
      const status: ServerStatus = await invoke('get_server_status');
      setServerStatus(status);
    } catch (error) {
      console.error('Failed to get server status:', error);
    } finally {
      setLoading(false);
    }
  };

  const startServer = async () => {
    try {
      setLoading(true);
      const result: string = await invoke('start_server', { port: 8443 });
      console.log('Server started:', result);
      loadServerStatus();
    } catch (error) {
      console.error('Failed to start server:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateToken = async () => {
    try {
      const token: string = await invoke('generate_join_token', { durationMinutes: 10 });
      setJoinToken(token);
    } catch (error) {
      console.error('Failed to generate token:', error);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getStatusColor = (isOnline: boolean) => {
    return isOnline ? 'text-green-600' : 'text-red-600';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">LabScan Admin Dashboard</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Server Status Card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold mb-2">Server Status</h2>
              <div className="space-y-1">
                <p className={`font-medium ${serverStatus?.running ? 'text-green-600' : 'text-red-600'}`}>
                  Status: {serverStatus?.running ? 'Running' : 'Stopped'}
                </p>
                <p>Port: {serverStatus?.port || 'N/A'}</p>
                <p>Fingerprint: {serverStatus?.tls_fingerprint.substring(0, 32)}...</p>
                <p>Connected Devices: {serverStatus?.device_count || devices.length}</p>
              </div>
            </div>
            <div className="space-x-3">
              {!serverStatus?.running && (
                <button
                  onClick={startServer}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
                >
                  Start Server
                </button>
              )}
              <button
                onClick={generateToken}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md"
              >
                Generate Join Token
              </button>
            </div>
          </div>
          
          {joinToken && (
            <div className="mt-4 p-4 bg-yellow-50 rounded-md">
              <p className="font-medium text-yellow-800">Join Token (valid for 10 minutes):</p>
              <p className="font-mono text-lg mt-1">{joinToken}</p>
            </div>
          )}
        </div>

        {/* Devices Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold">Connected Devices</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hostname
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    IP Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    OS/Arch
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Seen
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      No devices connected yet
                    </td>
                  </tr>
                ) : (
                  devices.map((device) => (
                    <tr key={device.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{device.hostname}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{device.local_ip}</div>
                        {device.mac_address && (
                          <div className="text-xs text-gray-500">MAC: {device.mac_address}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{device.os}</div>
                        <div className="text-xs text-gray-500">{device.arch}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(device.is_online)}`}>
                          {device.is_online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatTime(device.last_seen)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;