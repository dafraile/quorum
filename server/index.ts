// Production server: serves the built client from dist/ and the same /api routes
// the Vite dev server mounts. Build with `npm run build`, run with `npm start`.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiRoutes, sendJson } from "./api.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(process.env.QUORUM_DIST_DIR || path.join(here, "..", "dist"));
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

const fileExists = async (filePath: string) => {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
};

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);

  if (pathname.startsWith("/api/")) {
    const handler = apiRoutes[pathname];
    if (!handler) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    await handler(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  // Resolve inside dist/ only; anything that is not a file falls back to the SPA shell.
  const requested = path.resolve(distDir, `.${pathname}`);
  const insideDist = requested === distDir || requested.startsWith(`${distDir}${path.sep}`);
  const filePath = insideDist && (await fileExists(requested)) ? requested : path.join(distDir, "index.html");

  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypes[path.extname(filePath)] ?? "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Quorum listening on http://${host}:${port} (serving ${distDir})`);
});
