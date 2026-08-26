const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = new Set([
  "https://taithai.app",
  "https://www.taithai.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

function cors(request) {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://taithai.app",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(request, value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(request) }
  });
}

function safeMeta(value, max = 180) {
  return String(value || "").replace(/[\u0000-\u001f]/g, "").slice(0, max);
}

async function listFiles(request, env) {
  const result = await env.FILES.list({ limit: 1000, include: ["customMetadata"] });
  const now = Date.now();
  const expired = [];
  const files = [];
  for (const object of result.objects) {
    const uploadedAt = Number(object.customMetadata?.uploadedAt || object.uploaded.getTime());
    if (now - uploadedAt >= MAX_AGE_MS) {
      expired.push(object.key);
      continue;
    }
    files.push({
      id: object.key,
      name: object.customMetadata?.name || object.key,
      type: object.customMetadata?.type || "application/octet-stream",
      size: Number(object.customMetadata?.originalSize || object.size),
      protected: object.customMetadata?.protected === "true",
      salt: object.customMetadata?.salt || "",
      iv: object.customMetadata?.iv || "",
      uploadedAt
    });
  }
  if (expired.length) await env.FILES.delete(expired);
  files.sort((a, b) => b.uploadedAt - a.uploadedAt);
  return json(request, { files, truncated: result.truncated });
}

async function beginUpload(request, env) {
  const body = await request.json();
  const id = crypto.randomUUID();
  const key = `${Date.now()}_${id}`;
  const metadata = {
    name: safeMeta(body.name),
    type: safeMeta(body.type, 160) || "application/octet-stream",
    originalSize: String(Math.max(0, Number(body.size) || 0)),
    protected: body.protected ? "true" : "false",
    salt: safeMeta(body.salt, 32),
    iv: safeMeta(body.iv, 24),
    uploadedAt: String(Date.now())
  };
  const upload = await env.FILES.createMultipartUpload(key, { customMetadata: metadata });
  return json(request, { key, uploadId: upload.uploadId });
}

async function uploadPart(request, env, key, uploadId, partNumber) {
  const upload = env.FILES.resumeMultipartUpload(key, uploadId);
  const part = await upload.uploadPart(partNumber, request.body);
  return json(request, { partNumber: part.partNumber, etag: part.etag });
}

async function completeUpload(request, env, key) {
  const body = await request.json();
  const upload = env.FILES.resumeMultipartUpload(key, safeMeta(body.uploadId, 256));
  const object = await upload.complete(body.parts);
  return json(request, { key: object.key, size: object.size });
}

async function getFile(request, env, key) {
  const object = await env.FILES.get(key);
  if (!object) return json(request, { error: "FILE_NOT_FOUND" }, 404);
  const uploadedAt = Number(object.customMetadata?.uploadedAt || object.uploaded.getTime());
  if (Date.now() - uploadedAt >= MAX_AGE_MS) {
    await env.FILES.delete(key);
    return json(request, { error: "FILE_EXPIRED" }, 410);
  }
  const headers = new Headers(cors(request));
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", object.customMetadata?.protected === "true"
    ? "application/octet-stream"
    : object.customMetadata?.type || "application/octet-stream");
  headers.set("Cache-Control", "private, max-age=0, no-store");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      if (request.method === "GET" && url.pathname === "/files") return listFiles(request, env);
      if (request.method === "POST" && url.pathname === "/files/init") return beginUpload(request, env);
      if (request.method === "PUT" && parts[0] === "files" && parts[2] === "parts") {
        return uploadPart(request, env, parts[1], url.searchParams.get("uploadId") || "", Number(parts[3]));
      }
      if (request.method === "POST" && parts[0] === "files" && parts[2] === "complete") {
        return completeUpload(request, env, parts[1]);
      }
      if (request.method === "GET" && parts[0] === "files" && parts.length === 2) return getFile(request, env, parts[1]);
      return json(request, { error: "NOT_FOUND" }, 404);
    } catch (error) {
      console.error(error);
      return json(request, { error: "REQUEST_FAILED" }, 500);
    }
  }
};
