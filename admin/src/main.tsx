import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { logger } from "@/lib/logger";

void logger.info("React frontend startup", {
  mode: import.meta.env.MODE,
  tauri: "__TAURI_INTERNALS__" in window,
});

createRoot(document.getElementById("root")!).render(<App />);
