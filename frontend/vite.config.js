import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import os from "os";

// Vite plugin that ports the Webpack health-check plugin behaviour.
// Adds /health, /health/simple, /health/ready, /health/live,
// /health/errors, /health/stats endpoints to the dev server.
function viteHealthPlugin() {
  const status = {
    state: "idle",
    errors: [],
    warnings: [],
    lastCompileTime: null,
    lastSuccessTime: null,
    compileDuration: 0,
    totalCompiles: 0,
    firstCompileTime: null,
  };

  const serverStartTime = Date.now();

  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
  }

  function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

  return {
    name: "vite-health-plugin",

    buildStart() {
      const now = Date.now();
      status.state = "compiling";
      status.lastCompileTime = now;
      if (!status.firstCompileTime) status.firstCompileTime = now;
    },

    buildEnd(err) {
      status.totalCompiles++;
      status.compileDuration = Date.now() - status.lastCompileTime;
      if (err) {
        status.state = "failed";
        status.errors = [{ message: err.message, stack: err.stack }];
      } else {
        status.state = "success";
        status.lastSuccessTime = Date.now();
        status.errors = [];
        status.warnings = [];
      }
    },

    configureServer(server) {
      const app = server.middlewares;

      app.use("/health", (req, res, next) => {
        if (req.url !== "/" && req.url !== "") return next();
        const uptime = Date.now() - serverStartTime;
        const mem = process.memoryUsage();
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          status: status.state === "success" ? "healthy" : "unhealthy",
          timestamp: new Date().toISOString(),
          uptime: { seconds: Math.floor(uptime / 1000), formatted: formatDuration(uptime) },
          vite: {
            state: status.state,
            isHealthy: status.state === "success",
            hasCompiled: status.totalCompiles > 0,
            errors: status.errors.length,
            warnings: status.warnings.length,
            lastCompileTime: status.lastCompileTime ? new Date(status.lastCompileTime).toISOString() : null,
            lastSuccessTime: status.lastSuccessTime ? new Date(status.lastSuccessTime).toISOString() : null,
            compileDuration: status.compileDuration ? `${status.compileDuration}ms` : null,
            totalCompiles: status.totalCompiles,
          },
          server: {
            nodeVersion: process.version,
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            memory: {
              heapUsed: formatBytes(mem.heapUsed),
              heapTotal: formatBytes(mem.heapTotal),
              rss: formatBytes(mem.rss),
            },
            systemMemory: {
              total: formatBytes(os.totalmem()),
              free: formatBytes(os.freemem()),
            },
          },
          environment: process.env.NODE_ENV || "development",
        }));
      });

      app.use("/health/simple", (req, res, next) => {
        if (req.url !== "/" && req.url !== "") return next();
        const map = { success: [200, "OK"], compiling: [200, "COMPILING"], idle: [200, "IDLE"] };
        const [code, body] = map[status.state] ?? [503, "ERROR"];
        res.statusCode = code;
        res.end(body);
      });

      app.use("/health/ready", (req, res, next) => {
        if (req.url !== "/" && req.url !== "") return next();
        res.setHeader("Content-Type", "application/json");
        if (status.state === "success") {
          res.statusCode = 200;
          res.end(JSON.stringify({ ready: true, state: status.state }));
        } else {
          res.statusCode = 503;
          res.end(JSON.stringify({
            ready: false,
            state: status.state,
            reason: status.state === "compiling" ? "Compilation in progress" : "Compilation failed",
          }));
        }
      });

      app.use("/health/live", (req, res, next) => {
        if (req.url !== "/" && req.url !== "") return next();
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ alive: true, timestamp: new Date().toISOString() }));
      });

      app.use("/health/errors", (req, res, next) => {
        if (req.url !== "/" && req.url !== "") return next();
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          errorCount: status.errors.length,
          warningCount: status.warnings.length,
          errors: status.errors,
          warnings: status.warnings,
          state: status.state,
        }));
      });

      app.use("/health/stats", (req, res, next) => {
        if (req.url !== "/" && req.url !== "") return next();
        const uptime = Date.now() - serverStartTime;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          totalCompiles: status.totalCompiles,
          lastCompileDuration: status.compileDuration ? `${status.compileDuration}ms` : null,
          firstCompileTime: status.firstCompileTime ? new Date(status.firstCompileTime).toISOString() : null,
          serverUptime: formatDuration(uptime),
        }));
      });

      console.log("[Health Check] ✓ Health endpoints ready on dev server");
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const enableHealthCheck = env.ENABLE_HEALTH_CHECK === "true";

  return {
    plugins: [
      react(),
      ...(enableHealthCheck ? [viteHealthPlugin()] : []),
    ],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },

    assetsInclude: ["**/*.glb", "**/*.gltf"],

    build: {
      outDir: "dist",
      sourcemap: false,
    },

    server: {
      port: 3000,
      open: false,
    },
  };
});
