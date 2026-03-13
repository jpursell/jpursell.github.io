import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(webRoot, "src");
const publicRoot = path.join(webRoot, "public");

const port = Number(process.env.PORT || 5173);

function mimeType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".js") || p.endsWith(".mjs") || p.endsWith(".ts")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

function within(root, filePath) {
  const rel = path.relative(root, filePath);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function fileExists(p) {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

async function resolveFile(urlPath) {
  if (urlPath === "/") return path.join(webRoot, "index.html");

  if (urlPath.startsWith("/wasm/")) {
    const p = path.join(publicRoot, urlPath);
    return within(publicRoot, p) ? p : null;
  }

  if (urlPath.startsWith("/src/")) {
    let p = path.join(webRoot, urlPath);
    if (!within(srcRoot, p)) return null;

    if (await fileExists(p)) return p;

    // Browser ESM will request extensionless imports as-is; try TS/CSS.
    if (!path.extname(p)) {
      if (await fileExists(p + ".ts")) return p + ".ts";
      if (await fileExists(p + ".js")) return p + ".js";
      if (await fileExists(p + ".css")) return p + ".css";
    }

    return null;
  }

  // Allow serving assets directly from /public
  const publicCandidate = path.join(publicRoot, urlPath);
  if (within(publicRoot, publicCandidate) && (await fileExists(publicCandidate))) return publicCandidate;

  return null;
}

async function serveTs(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  const out = ts.transpileModule(source, {
    fileName: filePath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      sourceMap: false
    }
  });
  return out.outputText;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const filePath = await resolveFile(decodeURIComponent(url.pathname));

    if (!filePath) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ct = mimeType(filePath);

    if (filePath.endsWith(".ts")) {
      const js = await serveTs(filePath);
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" });
      res.end(js);
      return;
    }

    const buf = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-store" });
    res.end(buf);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(e instanceof Error ? e.stack || e.message : String(e));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`dev server: http://127.0.0.1:${port}/`);
  console.log("note: this dev server transpiles TS in-process (no esbuild), so it works in restricted environments.");
});
