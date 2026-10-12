// Local preview: serves public/ and runs api/claude.js, like Vercel does. Run: node --env-file=.env server.js
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/claude.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/claude")) {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    req.body = raw;
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
    return handler(req, res);
  }
  const file = path.join(root, path.normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, ""));
  const target = file.endsWith(path.sep) || !path.extname(file) ? path.join(file, "index.html") : file;
  try {
    res.setHeader("content-type", types[path.extname(target)] || "application/octet-stream");
    res.end(await readFile(target));
  } catch {
    res.statusCode = 404; res.end("Not found");
  }
}).listen(3000, () => console.log("Fairway Buddy on http://localhost:3000"));
