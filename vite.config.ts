import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const target = env.VITE_PROXY_TARGET || "http://localhost:5244"

  return {
    // Relative base so the built bundle works both when OpenList serves it at
    // the site root (dist_dir) and when it is hosted under a sub-path.
    base: "./",
    plugins: [react()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
      port: 5173,
      // Dev only: same-origin proxy to a running OpenList, so no CORS changes
      // are required while developing. In production OpenList serves both the
      // static bundle and the API from the same origin, so no proxy is used.
      proxy: {
        "/api": { target, changeOrigin: true },
        "/d": { target, changeOrigin: true },
        "/p": { target, changeOrigin: true },
      },
    },
    build: {
      target: "es2020",
      outDir: "dist",
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
    },
  }
})
