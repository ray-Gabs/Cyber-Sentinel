import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "path";

// Set VITE_HTTPS=true in your shell to enable HTTPS (self-signed cert).
// Example: VITE_HTTPS=true npm run dev
const useHttps = process.env.VITE_HTTPS === "true";

export default defineConfig({
  plugins: [
    react(),
    // Only load the SSL plugin when HTTPS mode is requested.
    // This avoids the browser cert warning during normal HTTP dev.
    ...(useHttps ? [basicSsl()] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // Bind to all interfaces so the app is reachable from other machines on the network.
    // Without this Vite only listens on localhost.
    host: "0.0.0.0",
    proxy: {
      // Proxy API requests to FastAPI during development
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      // Proxy WebSocket connections
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
});
