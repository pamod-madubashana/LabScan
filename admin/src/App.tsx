import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Devices from "./pages/Devices";
import NetworkMap from "./pages/NetworkMap";
import Tasks from "./pages/Tasks";
import Logs from "./pages/Logs";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import { LabScanProvider } from "@/lib/labscan";

const queryClient = new QueryClient();

const CONTEXT_MENU_ALLOW_SELECTOR = "input, textarea, [contenteditable='true'], [data-allow-context-menu='true']";

const App = () => {
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const el = event.target as HTMLElement | null;

      if (!el) {
        event.preventDefault();
        return;
      }

      const allow = el.closest(CONTEXT_MENU_ALLOW_SELECTOR);
      if (!allow) {
        event.preventDefault();
      }
    };

    document.addEventListener("contextmenu", onContextMenu, { capture: true });
    return () => {
      document.removeEventListener("contextmenu", onContextMenu, { capture: true });
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        <LabScanProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/devices" element={<Devices />} />
                <Route path="/network" element={<NetworkMap />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </LabScanProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
