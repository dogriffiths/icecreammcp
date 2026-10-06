/**
 * Minimal MCP stdio client for testing.
 *
 * Spawns the server as a child process and communicates with it using the
 * MCP JSON-RPC protocol over stdin/stdout (newline-delimited JSON).
 */

import { spawn } from "child_process";
import { createInterface } from "readline";

export class McpTestClient {
  #proc = null;
  #rl = null;
  #nextId = 1;
  #pending = new Map(); // id → { resolve, reject }
  #serverPath;
  #serverArgs;

  constructor(serverPath, serverArgs = []) {
    this.#serverPath = serverPath;
    this.#serverArgs = serverArgs;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start() {
    this.#proc = spawn("node", [this.#serverPath, ...this.#serverArgs], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Suppress simulator / web-server side-effects if any env flag exists
        MCP_TEST_MODE: "1",
      },
    });

    this.#proc.stderr.on("data", () => {}); // swallow log output

    this.#rl = createInterface({ input: this.#proc.stdout, crlfDelay: Infinity });

    this.#rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return; }

      if (msg.id != null && this.#pending.has(msg.id)) {
        const { resolve, reject } = this.#pending.get(msg.id);
        this.#pending.delete(msg.id);
        if (msg.error) reject(Object.assign(new Error(msg.error.message), msg.error));
        else           resolve(msg.result);
      }
    });

    // Send MCP initialize handshake
    await this.#request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "0.0.1" },
    });

    // Send initialized notification (no reply expected)
    this.#notify("notifications/initialized", {});
  }

  async stop() {
    this.#proc?.kill("SIGTERM");
    await new Promise((res) => setTimeout(res, 200));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Call a tool and return { content, isError } */
  async callTool(name, args = {}) {
    const result = await this.#request("tools/call", { name, arguments: args });
    return result; // { content: [{type,text},...], isError? }
  }

  /** Read a resource and return the first content item's parsed text */
  async readResource(uri) {
    const result = await this.#request("resources/read", { uri });
    return result.contents[0];
  }

  /** Return the text of the first content block from a tool result */
  static text(result) {
    return result?.content?.[0]?.text ?? "";
  }

  /** Parse the JSON text from a tool result */
  static json(result) {
    return JSON.parse(McpTestClient.text(result));
  }

  /** True when the tool returned isError: true */
  static isError(result) {
    return result?.isError === true;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  #request(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      this.#proc.stdin.write(msg + "\n");

      // Per-request timeout so tests don't hang forever
      setTimeout(() => {
        if (this.#pending.has(id)) {
          this.#pending.delete(id);
          reject(new Error(`Timeout waiting for response to "${method}" (id=${id})`));
        }
      }, 8000);
    });
  }

  #notify(method, params = {}) {
    const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
    this.#proc.stdin.write(msg + "\n");
  }
}
