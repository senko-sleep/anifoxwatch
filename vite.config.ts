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
          timeout: 35_000,
          proxyTimeout: 35_000,
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('[Vite Proxy]', req.method, req.url, '→', apiProxyTarget);
            });
            proxy.on('error', (err, _req, _res) => {
              console.log('[Vite Proxy] API Error - retrying:', err.message);
              // Return error to let frontend handle retry
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('[Vite Proxy] API Response:', proxyRes.statusCode, req.url);
            });
          },
        },
        "/health": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          timeout: 10_000,
          proxyTimeout: 10_000,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('[Vite Proxy] Health Error - will retry:', err.message);
            });
          },
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
