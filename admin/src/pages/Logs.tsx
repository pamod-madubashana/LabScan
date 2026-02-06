import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLabScan } from "@/lib/labscan";

const levelClass: Record<string, string> = {
  INFO: "text-green",
  WARN: "text-amber",
  ERROR: "text-red",
  DEBUG: "text-cyan",
};

const Logs = () => {
  const { state } = useLabScan();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<string[]>(["INFO", "WARN", "ERROR", "DEBUG"]);

  const logs = useMemo(() => {
    const q = search.toLowerCase();
    return state.logs.filter((entry) => {
      if (!filters.includes(entry.level)) {
        return false;
      }

      if (!q) {
        return true;
      }

      return (
        entry.message.toLowerCase().includes(q) ||
        entry.agent_id?.toLowerCase().includes(q) ||
        entry.level.toLowerCase().includes(q)
      );
    });
  }, [state.logs, filters, search]);

  const toggle = (level: string) => {
    setFilters((prev) => (prev.includes(level) ? prev.filter((value) => value !== level) : [...prev, level]));
  };

  return (
    <div className="p-5 flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Logs</h2>
          <p className="text-xs text-muted-foreground font-mono">{logs.length} entries</p>
        </div>

        <div className="flex items-center gap-2">
          {(["INFO", "WARN", "ERROR", "DEBUG"] as const).map((level) => (
            <button
              key={level}
              onClick={() => toggle(level)}
              className={cn(
                "px-2 py-1 rounded text-[10px] font-mono border",
                filters.includes(level) ? cn(levelClass[level], "border-current/40") : "text-muted-foreground border-border/40",
              )}
            >
              {level}
            </button>
          ))}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-8 h-8 w-64 bg-muted/50 border-border/50 text-xs font-mono"
              placeholder="Filter by text or agent"
            />
          </div>
        </div>
      </div>

      <div className="glass-panel flex-1 overflow-auto custom-scrollbar p-3 font-mono text-[11px]">
        {logs.length === 0 && <div className="text-xs text-muted-foreground">No log events yet.</div>}
        {logs.map((entry) => (
          <div key={entry.id} className="grid grid-cols-[180px_60px_180px_1fr] gap-3 py-1 border-b border-border/10">
            <span className="text-muted-foreground">{new Date(entry.ts).toLocaleString()}</span>
            <span className={cn("font-semibold", levelClass[entry.level] ?? "text-muted-foreground")}>{entry.level}</span>
            <span className="text-muted-foreground">{entry.agent_id ?? "server"}</span>
            <span className="text-foreground/90">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Logs;
