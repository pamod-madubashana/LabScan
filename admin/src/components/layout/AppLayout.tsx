import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopStatusBar } from "./TopStatusBar";

export function AppLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background noise-overlay">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopStatusBar />
        <main className="flex-1 overflow-auto custom-scrollbar grid-bg">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
