import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${process.env.MOMENTUM_API_PORT || env.MOMENTUM_API_PORT || process.env.PORT || env.PORT || "3001"}`,
          changeOrigin: false,
        },
      },
    },
  };
});
