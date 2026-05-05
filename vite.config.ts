import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget =
    String(env.VITE_API_PROXY_TARGET || "").trim() ||
    `http://127.0.0.1:${String(env.VITE_API_PROXY_PORT || "3001").replace(/\/$/, "")}`;

  return {
    publicDir: 'public',
  server: {
    host: "localhost",
    port: 8081,
    strictPort: true,
    hmr: {
      host: "localhost",
      overlay: true,
    },
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
        "/health": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      assetsInclude: ['**/*.svg', '**/*.ico', '**/*.webmanifest'],
    },
  };
});
