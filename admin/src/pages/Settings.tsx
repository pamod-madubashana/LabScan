import { useState } from "react";
import { Copy, RefreshCw, Save } from "lucide-react";
import { useLabScan } from "@/lib/labscan";

const Settings = () => {
  const { state, updateSharedSecret, generatePairToken } = useLabScan();
  const [secret, setSecret] = useState(state.settings.shared_secret);
  const [generated, setGenerated] = useState("");
  const [saving, setSaving] = useState(false);

  const saveSecret = async () => {
    setSaving(true);
    try {
      await updateSharedSecret(secret.trim());
    } finally {
      setSaving(false);
    }
  };

  const createToken = async () => {
    const token = await generatePairToken();
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
          Listening on {state.server.bind_addr}:{state.server.port}
        </p>
        <p className="text-xs text-muted-foreground">Use Windows Firewall inbound allow rule for TCP {state.server.port}.</p>
      </div>

      <div className="glass-panel p-4 space-y-3">
        <h3 className="text-sm font-medium">Shared Secret</h3>
        <p className="text-xs text-muted-foreground">Agents must provide this secret in the register message.</p>
        <div className="flex items-center gap-2">
          <input
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            className="flex-1 h-9 rounded bg-muted/50 border border-border px-3 text-sm"
            placeholder="shared secret"
          />
          <button
            onClick={saveSecret}
            disabled={saving}
            className="h-9 px-3 rounded-md bg-primary/10 border border-primary/20 text-primary text-xs inline-flex items-center gap-1"
          >
            <Save className="w-3.5 h-3.5" /> {saving ? "Saving" : "Save"}
          </button>
        </div>
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
