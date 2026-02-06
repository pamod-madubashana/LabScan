import { useMemo } from "react";
import { CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";
import { formatSince, useLabScan } from "@/lib/labscan";
import { cn } from "@/lib/utils";

const statusStyle = {
  queued: { icon: Clock3, color: "text-muted-foreground", label: "Queued" },
  running: { icon: Loader2, color: "text-cyan", label: "Running" },
  done: { icon: CheckCircle2, color: "text-green", label: "Done" },
  failed: { icon: XCircle, color: "text-red", label: "Failed" },
};

const Tasks = () => {
  const { state } = useLabScan();

  const counts = useMemo(() => {
    return {
      queued: state.tasks.filter((task) => task.status === "queued").length,
      running: state.tasks.filter((task) => task.status === "running").length,
      done: state.tasks.filter((task) => task.status === "done").length,
      failed: state.tasks.filter((task) => task.status === "failed").length,
    };
  }, [state.tasks]);

  return (
    <div className="p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Tasks / Jobs</h2>
        <p className="text-xs text-muted-foreground font-mono">
          {counts.running} running · {counts.queued} queued · {counts.done} done · {counts.failed} failed
        </p>
      </div>

      <div className="space-y-2">
        {state.tasks.length === 0 && (
          <div className="glass-panel p-6 text-center text-xs font-mono text-muted-foreground">No tasks dispatched yet.</div>
        )}
        {state.tasks.map((task) => {
          const cfg = statusStyle[task.status];
          const StatusIcon = cfg.icon;

          return (
            <div key={task.task_id} className="glass-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusIcon className={cn("w-4 h-4", cfg.color, task.status === "running" && "animate-spin")} />
                    <span className="text-sm text-foreground font-medium">{task.kind}</span>
                    <span className={cn("text-[10px] font-mono uppercase", cfg.color)}>{cfg.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">Task ID: {task.task_id}</p>
                  <p className="text-xs text-muted-foreground">Agents: {task.assigned_agents.join(", ")}</p>
                  <p className="text-xs text-muted-foreground">Created: {formatSince(task.created_at)}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Results: {task.results.length}/{task.assigned_agents.length}</p>
                </div>
              </div>

              {task.results.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/30 space-y-1">
                  {task.results.map((result) => (
                    <p key={result.agent_id} className="text-xs font-mono text-muted-foreground">
                      <span className={result.ok ? "text-green" : "text-red"}>{result.ok ? "OK" : "ERR"}</span> {result.agent_id}
                      {result.error ? ` - ${result.error}` : ""}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Tasks;
