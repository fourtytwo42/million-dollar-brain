import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const documentPath = join(
  scriptDirectory,
  "..",
  "apps",
  "coming-soon",
  "index.html",
);
const port = Number.parseInt(process.env.COMING_SOON_PORT ?? "3002", 10);
const host = process.env.COMING_SOON_HOST ?? "127.0.0.1";
const document = await readFile(documentPath);

const server = createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    });
    response.end("ok\n");
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }
  if (request.url !== "/" && request.url !== "/index.html") {
    response.writeHead(404, {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    });
    response.end("Not found\n");
    return;
  }
  response.writeHead(200, {
    "cache-control": "public, max-age=300",
    "content-length": document.byteLength,
    "content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "content-type": "text/html; charset=utf-8",
    "permissions-policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  response.end(document);
});

server.listen(port, host, () => {
  console.log(
    `42 Braincells coming-soon origin listening on http://${host}:${port}`,
  );
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
