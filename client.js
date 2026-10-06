#!/usr/bin/env node
/**
 * Interactive terminal client for the Ice Cream Robot MCP server.
 * Run with:  node client.js
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, "server.js");

// ─── Colours ──────────────────────────────────────────────────────────────────
const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  cyan:   "\x1b[36m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  magenta:"\x1b[35m",
};

const fmt = {
  title:  (s) => `${c.bold}${c.cyan}${s}${c.reset}`,
  ok:     (s) => `${c.green}${s}${c.reset}`,
  err:    (s) => `${c.red}${s}${c.reset}`,
  dim:    (s) => `${c.dim}${s}${c.reset}`,
  cmd:    (s) => `${c.yellow}${s}${c.reset}`,
  prompt: ()  => `${c.magenta}🍦 > ${c.reset}`,
};

// ─── Tool registry ────────────────────────────────────────────────────────────
// Maps short command names → { mcpName, args }
const TOOLS = {
  pickup:   { name: "pick_up_glass",             args: {} },
  place:    { name: "put_glass_under_fountain",   args: {} },
  pump:     { name: "pump_ice_cream",             args: {} },
  cherry:   { name: "add_cherry",                 args: {} },
  serve:    { name: "give_ice_cream_to_customer", args: {} },

  // flavor needs a dynamic argument – handled specially in dispatch()
  flavor:   { name: "select_flavor",              args: null },
};

const HELP = `
${fmt.title("Ice Cream Robot — available commands")}

  ${fmt.cmd("pickup")}               Pick up a glass
  ${fmt.cmd("place")}                Place the glass under the fountain
  ${fmt.cmd("flavor")} ${fmt.dim("<name>")}     Select a flavour: ${fmt.dim("chocolate | strawberry | mango")}
  ${fmt.cmd("pump")}                 Pump ice cream into the glass
  ${fmt.cmd("cherry")}               Add a cherry on top
  ${fmt.cmd("serve")}                Give the ice cream to the customer

  ${fmt.cmd("tools")}                List all MCP tools exposed by the server
  ${fmt.cmd("help")}                 Show this help
  ${fmt.cmd("exit")}  /  ${fmt.cmd("quit")}        Disconnect and exit
`;

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(fmt.title("\n🍦  Ice Cream Robot — interactive terminal client\n"));
  console.log(fmt.dim("Connecting to server…"));

  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_PATH],
  });

  const client = new Client({ name: "icecream-terminal-client", version: "1.0.0" });

  try {
    await client.connect(transport);
  } catch (err) {
    console.error(fmt.err(`Failed to connect to server: ${err.message}`));
    process.exit(1);
  }

  console.log(fmt.ok("Connected.\n"));
  console.log(HELP);

  // ── REPL ──────────────────────────────────────────────────────────────────
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: fmt.prompt(),
  });

  rl.prompt();

  rl.on("line", async (raw) => {
    const line = raw.trim();
    if (!line) { rl.prompt(); return; }

    const [cmd, ...rest] = line.split(/\s+/);

    // ── Built-ins ────────────────────────────────────────────────────────────
    if (cmd === "exit" || cmd === "quit") {
      console.log(fmt.dim("Goodbye!"));
      await client.close();
      process.exit(0);
    }

    if (cmd === "help") {
      console.log(HELP);
      rl.prompt();
      return;
    }

    if (cmd === "tools") {
      try {
        const { tools } = await client.listTools();
        console.log(`\n${fmt.title("Available MCP tools:")}`);
        tools.forEach((t) =>
          console.log(`  ${fmt.cmd(t.name)}\n    ${fmt.dim(t.description)}\n`)
        );
      } catch (err) {
        console.log(fmt.err(`Could not list tools: ${err.message}`));
      }
      rl.prompt();
      return;
    }

    // ── Dispatch to MCP tool ─────────────────────────────────────────────────
    const entry = TOOLS[cmd];
    if (!entry) {
      console.log(fmt.err(`Unknown command "${cmd}". Type ${fmt.cmd("help")} for a list.`));
      rl.prompt();
      return;
    }

    // Build arguments
    let args = entry.args ?? {};
    if (cmd === "flavor") {
      const flavor = rest[0];
      if (!flavor) {
        console.log(fmt.err('Usage: flavor <chocolate|strawberry|mango>'));
        rl.prompt();
        return;
      }
      args = { flavor };
    }

    // Call the tool
    try {
      const result = await client.callTool({ name: entry.name, arguments: args });
      const text = result.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      if (result.isError) {
        console.log(fmt.err(`\n  ✗ ${text}\n`));
      } else {
        console.log(fmt.ok(`\n  ✓ ${text}\n`));
      }
    } catch (err) {
      console.log(fmt.err(`\n  ✗ Tool call failed: ${err.message}\n`));
    }

    rl.prompt();
  });

  rl.on("close", async () => {
    console.log(fmt.dim("\nGoodbye!"));
    await client.close();
    process.exit(0);
  });
}

main();
