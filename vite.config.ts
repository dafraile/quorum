import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { apiRoutes } from "./server/api.ts";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "quorum-dev-api",
      configureServer(server) {
        for (const [route, handler] of Object.entries(apiRoutes)) {
          server.middlewares.use(route, (req, res) => {
            void handler(req, res);
          });
        }
      },
    },
  ],
});
