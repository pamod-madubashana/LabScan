import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Play, Pause, RotateCcw, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type TaskStatus = "running" | "completed" | "failed" | "queued";

interface Task {
  id: string;
  name: string;
  target: string;
  status: TaskStatus;
  progress: number;
  startTime: string;
  duration: string;
}

const taskStatusConfig: Record<TaskStatus, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  running: { icon: Loader2, color: "text-cyan", bg: "bg-cyan/10", label: "Running" },
  completed: { icon: CheckCircle2, color: "text-green", bg: "bg-green/10", label: "Completed" },
  failed: { icon: XCircle, color: "text-red", bg: "bg-red/10", label: "Failed" },
  queued: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted/50", label: "Queued" },
};

const tasks: Task[] = [
  { id: "1", name: "Full Port Scan", target: "10.0.2.0/24", status: "running", progress: 67, startTime: "14:28", duration: "4m 12s" },
  { id: "2", name: "Vulnerability Assessment", target: "db-prod-01", status: "running", progress: 34, startTime: "14:25", duration: "7m 05s" },
  { id: "3", name: "Service Discovery", target: "10.0.1.0/24", status: "completed", progress: 100, startTime: "14:10", duration: "12m 44s" },
  { id: "4", name: "SSL/TLS Audit", target: "proxy-gw", status: "completed", progress: 100, startTime: "13:55", duration: "5m 18s" },
  { id: "5", name: "Network Sweep", target: "10.0.3.0/24", status: "queued", progress: 0, startTime: "—", duration: "—" },
  { id: "6", name: "Compliance Check", target: "All Servers", status: "queued", progress: 0, startTime: "—", duration: "—" },
  { id: "7", name: "Port Scan", target: "mail-srv", status: "failed", progress: 45, startTime: "13:40", duration: "2m 11s" },
  { id: "8", name: "DNS Enumeration", target: "corp.local", status: "completed", progress: 100, startTime: "13:20", duration: "8m 30s" },
];

const Tasks = () => {
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Tasks / Jobs</h2>
          <p className="text-xs text-muted-foreground font-mono">
            {tasks.filter((t) => t.status === "running").length} running · {tasks.filter((t) => t.status === "queued").length} queued
          </p>
        </div>
        <button className="h-8 px-3.5 rounded-md bg-primary/10 border border-primary/20 text-xs font-medium text-primary hover:bg-primary/15 transition-colors flex items-center gap-1.5">
          <Play className="w-3.5 h-3.5" />
          New Task
        </button>
      </div>

      <div className="space-y-2">
        {tasks.map((task, i) => {
          const config = taskStatusConfig[task.status];
          const StatusIcon = config.icon;
          return (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass-panel p-4 hover:border-white/[0.1] transition-all"
            >
              <div className="flex items-center gap-4">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", config.bg)}>
                  <StatusIcon className={cn("w-4 h-4", config.color, task.status === "running" && "animate-spin")} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">{task.name}</span>
                    <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded", config.color, config.bg)}>
                      {config.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
                    <span>Target: {task.target}</span>
                    <span>Start: {task.startTime}</span>
                    <span>Duration: {task.duration}</span>
                  </div>
                </div>

                {/* Progress bar for running tasks */}
                {task.status === "running" && (
                  <div className="w-32 flex-shrink-0">
                    <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1">
                      <span>Progress</span>
                      <span className="text-cyan">{task.progress}%</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${task.progress}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="h-full bg-cyan rounded-full shadow-[0_0_8px_hsl(190_95%_45%/0.3)]"
                      />
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {task.status === "running" && (
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <button className="w-7 h-7 rounded flex items-center justify-center text-amber hover:bg-amber/10 transition-colors">
                          <Pause className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="bg-card border-border text-foreground text-xs">Pause</TooltipContent>
                    </Tooltip>
                  )}
                  {(task.status === "failed" || task.status === "completed") && (
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <button className="w-7 h-7 rounded flex items-center justify-center text-cyan hover:bg-cyan/10 transition-colors">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="bg-card border-border text-foreground text-xs">Retry</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default Tasks;
