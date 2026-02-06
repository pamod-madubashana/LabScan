import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { useLabScan } from "@/lib/labscan";

const Settings = () => {
  const { state, getPairToken, rotatePairToken } = useLabScan();
  const [generated, setGenerated] = useState("");

  useEffect(() => {
    void (async () => {
      const token = await getPairToken();
      setGenerated(token);
    })();
  }, [getPairToken]);

  const createToken = async () => {
    const token = await rotatePairToken();
    setGenerated(token);
  };

  return (
    <div className="p-5 max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Settings</h2>
        <p className="text-xs text-muted-foreground font-mono">LAN server settings and pairing security</p>
      </div>

      <div className="glass-panel p-4 space-y-3">
        <h3 className="text-sm font-medium">Server</h3>
        <p className="text-xs text-muted-foreground font-mono">
          WebSocket on 0.0.0.0:{state.server.port_ws}
        </p>
        <p className="text-xs text-muted-foreground font-mono">Provisioning broadcast UDP {state.server.port_udp}</p>
      </div>

      <div className="glass-panel p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Pair Token</h3>
          <button onClick={createToken} className="h-8 px-3 rounded-md border border-border text-xs inline-flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Generate
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Optional onboarding token for assisted setup workflows.</p>
        <div className="h-9 rounded bg-muted/40 border border-border px-3 flex items-center justify-between">
          <span className="font-mono text-xs text-foreground truncate">{generated || "No token generated yet"}</span>
          {generated && (
            <button onClick={() => navigator.clipboard.writeText(generated)} className="text-muted-foreground hover:text-foreground">
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
