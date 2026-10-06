#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ─── Log file setup ───────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.join(__dirname, "icecream-robot.log");

/**
 * Append a timestamped line to the log file and return the formatted message.
 */
function log(message, level = "INFO") {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.padEnd(5)}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line, "utf8");
}

function logInfo(message) { log(message, "INFO"); }
function logError(message) { log(message, "ERROR"); }

// ─── Robot state ──────────────────────────────────────────────────────────────

/**
 * All mutable state lives here.
 *
 * hasGlass          – the robot is holding a glass
 * glassUnderFountain – the held glass is positioned under the fountain
 * glassIsEmpty      – no ice cream has been pumped into the glass yet
 * hasIceCream       – ice cream has been pumped into the glass
 * selectedFlavor    – the currently selected fountain flavour (or null)
 * cherryCount       – number of cherries added to the current serving
 */
const state = {
  hasGlass: false,
  glassUnderFountain: false,
  glassIsEmpty: true,
  hasIceCream: false,
  selectedFlavor: null,
  cherryCount: 0,
};

/** Return a compact state snapshot string, useful for log entries. */
function snapshot() {
  return (
    `[state] hasGlass=${state.hasGlass}` +
    ` | underFountain=${state.glassUnderFountain}` +
    ` | empty=${state.glassIsEmpty}` +
    ` | hasIceCream=${state.hasIceCream}` +
    ` | flavor=${state.selectedFlavor ?? "none"}` +
    ` | cherries=${state.cherryCount}`
  );
}

/** Build a successful MCP tool result and log it. */
function ok(message) {
  logInfo(`${message}  ${snapshot()}`);
  return {
    content: [{ type: "text", text: message }],
  };
}

/** Build an error MCP tool result and log it. */
function fail(message) {
  logError(`${message}  ${snapshot()}`);
  return {
    content: [{ type: "text", text: `ERROR: ${message}` }],
    isError: true,
  };
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "icecream-robot",
  version: "1.0.0",
});

// ── Tool: pick_up_glass ───────────────────────────────────────────────────────

server.tool(
  "pick_up_glass",
  "Pick up a clean, empty glass. " +
    "Fails if the robot is already holding a glass.",
  {},
  async () => {
    if (state.hasGlass) {
      return fail(
        "Cannot pick up a glass: the robot is already holding one. " +
          "Give the current glass to the customer first."
      );
    }

    state.hasGlass = true;
    state.glassIsEmpty = true;
    state.glassUnderFountain = false;
    state.hasIceCream = false;
    state.cherryCount = 0;

    return ok("Picked up a clean, empty glass.");
  }
);

// ── Tool: put_glass_under_fountain ────────────────────────────────────────────

server.tool(
  "put_glass_under_fountain",
  "Place the currently held glass under the ice cream fountain. " +
    "The robot must be holding an empty glass.",
  {},
  async () => {
    if (!state.hasGlass) {
      return fail(
        "Cannot place a glass under the fountain: " +
          "the robot is not holding a glass. Pick one up first."
      );
    }
    if (!state.glassIsEmpty) {
      return fail(
        "Cannot place the glass under the fountain: " +
          "the glass is not empty. Only an empty glass may be positioned there."
      );
    }
    if (state.glassUnderFountain) {
      return fail(
        "The glass is already under the fountain."
      );
    }

    state.glassUnderFountain = true;

    return ok("Glass placed under the ice cream fountain, ready to fill.");
  }
);

// ── Tool: select_flavor ───────────────────────────────────────────────────────

server.tool(
  "select_flavor",
  "Choose the ice cream flavour for the fountain. " +
    "Valid flavours: chocolate, strawberry, mango.",
  {
    flavor: z
      .enum(["chocolate", "strawberry", "mango"])
      .describe("The ice cream flavour to select"),
  },
  async ({ flavor }) => {
    state.selectedFlavor = flavor;

    return ok(`Fountain flavour set to "${flavor}".`);
  }
);

// ── Tool: pump_ice_cream ──────────────────────────────────────────────────────

server.tool(
  "pump_ice_cream",
  "Pump ice cream from the fountain into the glass. " +
    "A flavour must be selected and the glass must be positioned under the fountain.",
  {},
  async () => {
    if (!state.glassUnderFountain) {
      return fail(
        "Cannot pump ice cream: no glass is under the fountain. " +
          "Pick up a glass and place it under the fountain first."
      );
    }
    if (!state.selectedFlavor) {
      return fail(
        "Cannot pump ice cream: no flavour has been selected. " +
          "Use select_flavor to choose one."
      );
    }

    state.hasIceCream = true;
    state.glassIsEmpty = false;

    return ok(
      `Pumped ${state.selectedFlavor} ice cream into the glass.`
    );
  }
);

// ── Tool: add_cherry ──────────────────────────────────────────────────────────

server.tool(
  "add_cherry",
  "Place a cherry on top of the ice cream. " +
    "Fails if there is no ice cream in the glass.",
  {},
  async () => {
    if (!state.hasIceCream) {
      return fail(
        "Cannot add a cherry: there is no ice cream in the glass. " +
          "Pump ice cream first."
      );
    }

    state.cherryCount += 1;

    return ok(
      `Cherry added. The glass now has ${state.cherryCount} ` +
        `${state.cherryCount === 1 ? "cherry" : "cherries"}.`
    );
  }
);

// ── Tool: give_ice_cream_to_customer ──────────────────────────────────────────

server.tool(
  "give_ice_cream_to_customer",
  "Hand the finished ice cream to the customer. " +
    "The glass must contain ice cream. " +
    "Afterwards the robot's hand is empty and ready for the next order.",
  {},
  async () => {
    if (!state.hasIceCream) {
      return fail(
        "Cannot serve the customer: the glass does not contain ice cream. " +
          "Pump ice cream into the glass first."
      );
    }

    const flavor = state.selectedFlavor;
    const cherries = state.cherryCount;
    const cherryLabel =
      cherries === 0
        ? "no cherries"
        : `${cherries} ${cherries === 1 ? "cherry" : "cherries"}`;

    // Reset all glass-related state – the glass leaves with the customer.
    state.hasGlass = false;
    state.glassUnderFountain = false;
    state.glassIsEmpty = true;
    state.hasIceCream = false;
    state.cherryCount = 0;
    // selectedFlavor is intentionally preserved – it stays on the fountain.

    return ok(
      `Served the customer: ${flavor} ice cream with ${cherryLabel}. ` +
        `The robot's hand is now empty.`
    );
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

logInfo("=".repeat(60));
logInfo("Ice Cream Robot MCP Server starting up.");
logInfo("=".repeat(60));

const transport = new StdioServerTransport();
await server.connect(transport);
