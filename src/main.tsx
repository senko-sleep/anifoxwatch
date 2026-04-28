import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startKeepAlive } from "./utils/keep-alive";

if (import.meta.env.DEV) {
  const filterReactDevToolsBanner = (args: unknown[]) => {
    const s = typeof args[0] === "string" ? args[0] : "";
    return s.includes("react-devtools") || s.includes("Download the React DevTools");
  };
  const log = console.log.bind(console);
  const info = console.info.bind(console);
  console.log = (...args: unknown[]) => {
    if (filterReactDevToolsBanner(args)) return;
    log(...args);
  };
  console.info = (...args: unknown[]) => {
    if (filterReactDevToolsBanner(args)) return;
    info(...args);
  };
}

// Start keep-alive service to prevent backend cold starts
startKeepAlive();

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker in production to make mobile feel more app-like.
if (!import.meta.env.DEV && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
