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

// Start keep-alive service to prevent API cold starts
startKeepAlive();

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker in production to make mobile feel more app-like.
if (!import.meta.env.DEV && "serviceWorker" in navigator) {
  // A new worker takes over right after a deploy (skipWaiting + clients.claim), but
  // this page was already booted from the previous build. Reload once so the
  // installed app runs the new code now instead of on its next launch. Skipped on
  // first install (no previous worker) and while a video is playing.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded) return;
    const playing = Array.from(document.querySelectorAll("video")).some((v) => !v.paused && !v.ended);
    if (playing) return;
    reloaded = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
