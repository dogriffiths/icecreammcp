#!/usr/bin/env node

import http from "http";
import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PUBLIC     = path.join(__dirname, "public");
const WEB_PORT   = 3000;
const LOG_FILE   = path.join(__dirname, "icecream-webserver.log");

// ─── Logging ──────────────────────────────────────────────────────────────────
// Writes to the log FILE only — never to stdout — so these functions are safe
// to call from both the standalone server process and when this module is
// imported by server.js (where stdout is the MCP JSON-RPC pipe).

function log(message, level = "INFO") {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] [${level.padEnd(5)}] ${message}\n`, "utf8");
}

function logInfo(msg)  { log(msg, "INFO");  }
function logError(msg) { log(msg, "ERROR"); }

// ─── HTTP client helpers ──────────────────────────────────────────────────────

function postToWebServer(endpoint, body = {}) {
  const payload = JSON.stringify(body);
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "localhost",
        port:     WEB_PORT,
        path:     endpoint,
        method:   "POST",
        headers: {
          "Content-Type":   "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      }
    );
    req.on("error", () => resolve(null));
    req.write(payload);
    req.end();
  });
}

// ─── Exported lifecycle helpers (imported by server.js) ──────────────────────

/** Push robot state to the web server (non-fatal if unreachable). */
export async function sendStateToSimulator(payload) {
  const result = await postToWebServer("/state", payload);
  if (!result) logError("Could not POST state to web server.");
}

/**
 * Ensure the web server is running and register this MCP instance with it.
 * Spawns this file as a detached child process if the server isn't reachable.
 */
export async function startSimulator() {
  if ((await postToWebServer("/register"))?.ok) {
    logInfo("Registered with existing web server.");
    return;
  }

  logInfo("Web server not running — spawning web-server.js...");
  const child = spawn(process.execPath, [__filename], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 200));
    if ((await postToWebServer("/register"))?.ok) {
      logInfo("Web server is up and this instance is registered.");
      return;
    }
  }
  logError("Web server did not become ready in time. Continuing without UI updates.");
}

/** Deregister this MCP instance. The web server shuts itself down when the count reaches zero. */
export async function stopSimulator() {
  await postToWebServer("/deregister");
}

// ─── Everything below only runs when this file is the entry point ─────────────

const isMain = process.argv[1] === __filename;

if (isMain) {

  // ── MCP instance reference count ───────────────────────────────────────────

  let instanceCount = 0;

  function gracefulShutdown() {
    logInfo("No MCP instances remaining. Shutting down web server.");
    for (const client of sseClients) {
      try { client.end(); } catch (_) { /* ignore */ }
    }
    sseClients.clear();
    httpServer.close(() => {
      logInfo("Web server stopped.");
      process.exit(0);
    });
  }

  // ── Shared state ───────────────────────────────────────────────────────────

  let currentState = {
    hasGlass: false,
    glassUnderFountain: false,
    hasIceCream: false,
    selectedFlavor: null,
    cherryCount: 0,
    lastAction: "init",
  };

  // ── SSE broadcast ──────────────────────────────────────────────────────────

  const sseClients = new Set();

  function broadcastState() {
    if (sseClients.size === 0) return;
    const payload = JSON.stringify(currentState);
    for (const client of sseClients) {
      try { client.write(`data: ${payload}\n\n`); } catch (_) { /* ignore */ }
    }
  }

  // ── HTTP Server ────────────────────────────────────────────────────────────

  const httpServer = http.createServer((req, res) => {

    if (req.url === "/register" && req.method === "POST") {
      instanceCount += 1;
      logInfo(`MCP instance registered. Active instances: ${instanceCount}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, count: instanceCount }));
      return;
    }

    if (req.url === "/deregister" && req.method === "POST") {
      instanceCount = Math.max(0, instanceCount - 1);
      logInfo(`MCP instance deregistered. Active instances: ${instanceCount}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, count: instanceCount }));
      if (instanceCount === 0) setTimeout(gracefulShutdown, 100);
      return;
    }

    if (req.url === "/state" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => (body += chunk));
      req.on("end", () => {
        try {
          currentState = JSON.parse(body);
          broadcastState();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400);
          res.end("Bad JSON");
        }
      });
      return;
    }

    if (req.url === "/events" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(`data: ${JSON.stringify(currentState)}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    // Static files
    const file = req.url === "/" ? "index.html" : req.url.slice(1);
    const full = path.resolve(PUBLIC, file);
    if (!full.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
    fs.readFile(full, (err, data) => {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      const ext  = path.extname(full);
      const mime =
        ext === ".html" ? "text/html"       :
        ext === ".js"   ? "text/javascript" :
        ext === ".css"  ? "text/css"        :
        "text/plain";
      res.writeHead(200, { "Content-Type": mime });
      res.end(data);
    });
  });

  httpServer.on("error", (err) => {
    logError(`HTTP server error: ${err.message}`);
    process.exit(1);
  });

  httpServer.listen(WEB_PORT, () => {
    // stderr is fine here — this process isn't a stdio MCP server.
    process.stderr.write(`Ice Cream Robot web UI: http://localhost:${WEB_PORT}\n`);
    logInfo(`Web server listening on port ${WEB_PORT}.`);
  });

  process.on("SIGINT",  () => { logInfo("SIGINT received.");  httpServer.close(() => process.exit(0)); });
  process.on("SIGTERM", () => { logInfo("SIGTERM received."); httpServer.close(() => process.exit(0)); });
}
