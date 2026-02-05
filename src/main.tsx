import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startKeepAlive } from "./utils/keep-alive";

// Start keep-alive service to prevent backend cold starts
startKeepAlive();

createRoot(document.getElementById("root")!).render(<App />);
