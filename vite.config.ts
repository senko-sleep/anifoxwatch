import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

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

  const serveLocalVideosPlugin = {
    name: "serve-local-videos",
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url || "";
        if (url.startsWith("/local/")) {
          const relativePath = decodeURIComponent(url.slice("/local/".length));
          const filePath = path.resolve("tests", relativePath);
          const testsDir = path.resolve("tests");

          if (!filePath.startsWith(testsDir + path.sep) && filePath !== testsDir) {
            res.statusCode = 403;
            res.end("Forbidden");
            return;
          }

          try {
            const stat = fs.statSync(filePath);
            if (!stat.isFile()) {
              res.statusCode = 404;
              res.end("Not Found");
              return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType =
              ext === ".mp4"
                ? "video/mp4"
                : ext === ".m3u8"
                  ? "application/vnd.apple.mpegurl"
                  : ext === ".ts"
                    ? "video/mp2t"
                    : "application/octet-stream";

            res.setHeader("Content-Type", contentType);
            res.setHeader("Content-Length", stat.size.toString());
            res.setHeader("Accept-Ranges", "bytes");
            res.setHeader("Cache-Control", "no-cache");

            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
            stream.on("error", () => {
              if (!res.headersSent) {
                res.statusCode = 500;
                res.end("Error reading file");
              }
            });
          } catch {
            res.statusCode = 404;
            res.end("Not Found");
          }
          return;
        }
        next();
      });
    },
  };

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
    plugins: [...plugins, serveLocalVideosPlugin],
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
