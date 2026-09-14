import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "site");
const distRoot = path.join(projectRoot, "dist");
const templatePath = path.join(projectRoot, "worker", "index.template.js");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function routesFor(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  if (normalized === "index.html") return ["/", "/index.html"];
  if (normalized.endsWith("/index.html")) {
    const base = `/${normalized.slice(0, -"index.html".length)}`;
    return [base, base.slice(0, -1), `/${normalized}`];
  }
  return [`/${normalized}`];
}

const assets = {};
for (const absolute of walk(sourceRoot)) {
  const relative = path.relative(sourceRoot, absolute);
  const bytes = fs.readFileSync(absolute);
  const record = {
    body: bytes.toString("base64"),
    etag: '"' + createHash("sha256").update(bytes).digest("hex") + '"',
    contentType: mimeTypes[path.extname(relative).toLowerCase()] || "application/octet-stream"
  };
  for (const route of routesFor(relative)) assets[route] = record;
}

const template = fs.readFileSync(templatePath, "utf8");

fs.rmSync(distRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(distRoot, "server"), { recursive: true });
fs.mkdirSync(path.join(distRoot, ".openai"), { recursive: true });
fs.writeFileSync(path.join(distRoot, "server", "index.js"), `const ACE_ASSET_MAP = ${JSON.stringify(assets)};\n${template}`);
// The portable export deliberately has no binding to the original hosting project.

console.log(`Built ACE Worker with ${Object.keys(assets).length} routes and assets`);
