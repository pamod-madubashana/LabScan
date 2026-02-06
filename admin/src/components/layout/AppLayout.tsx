import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopStatusBar } from "./TopStatusBar";

export function AppLayout() {
  return (
    <div className="app-root flex h-screen w-full overflow-hidden bg-background noise-overlay">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopStatusBar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar grid-bg min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
