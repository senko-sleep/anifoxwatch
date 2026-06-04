import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget =
    String(env.VITE_API_PROXY_TARGET || "").trim() ||
    `http://127.0.0.1:${String(env.VITE_API_PROXY_PORT || "3001").replace(/\/$/, "")}`;

  const plugins = [react()];
  if (mode === "development") {
    plugins.push((await import("lovable-tagger")).componentTagger());
  }

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
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      assetsInclude: ['**/*.svg', '**/*.ico', '**/*.webmanifest'],
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks: {
            // Keep React and related UI libraries together to avoid circular
            // chunk dependencies that can cause runtime initialization issues.
            'react-vendor': [
              'react',
              'react-dom',
              'react-router-dom',
              'lucide-react',
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu'
            ]
          }
        }
      }
    },
  };
});
