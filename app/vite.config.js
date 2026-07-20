import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, loadEnv } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const interoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function envPort(value, fallback) {
  const port = Number.parseInt(value || "", 10);
  return Number.isFinite(port) ? port : fallback;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, interoRoot, "");
  const serverPort = envPort(env.INTERO_SERVER_PORT, 8000);
  const appPort = envPort(env.INTERO_APP_PORT, 5173);
  const apiTarget = `http://127.0.0.1:${serverPort}`;

  return {
    plugins: [svelte()],
    build: {
      outDir: "static",
      emptyOutDir: true,
    },
    server: {
      port: appPort,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
