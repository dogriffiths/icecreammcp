#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ─── Control robot ───────────────────────────────────────────────────────────

import { startSimulator, stopSimulator, sendStateToSimulator } from "./robot-simulator.js";

// ─── Log file setup ───────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE  = path.join(__dirname, "icecream-robot.log");

function log(message, level = "INFO") {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level.padEnd(5)}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, line, "utf8");
}

function logInfo(msg)  { log(msg, "INFO");  }
function logError(msg) { log(msg, "ERROR"); }

// ─── State management ──────────────────────────────────────────────────────────────

const state = {
    hasGlass: false,
    glassUnderFountain: false,
    hasIceCream: false,
    selectedFlavor: null,
    cherryCount: 0,
};

function snapshot() {
    return (
        `[state] hasGlass=${state.hasGlass}` +
        ` | underFountain=${state.glassUnderFountain}` +
        ` | hasIceCream=${state.hasIceCream}` +
        ` | flavor=${state.selectedFlavor ?? "none"}` +
        ` | cherries=${state.cherryCount}`
    );
}

// ─── Tool helpers ─────────────────────────────────────────────────────────────

const ANIMATION_DELAY_MS = 1000;

async function ok(message) {
    logInfo(`${message}  ${snapshot()}`);
    await sendStateToSimulator({ ...state, lastAction: message });
    await new Promise(res => setTimeout(res, ANIMATION_DELAY_MS));
    return { content: [{ type: "text", text: message }] };
}

function fail(message) {
    logError(`${message}  ${snapshot()}`);
    return { content: [{ type: "text", text: `ERROR: ${message}` }], isError: true };
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({ name: "icecream-robot", version: "1.0.0" });

server.resource(
    "robot-state",
    "icecream-robot://state",
    { description: "The current state of the ice cream robot.", mimeType: "application/json" },
    async () => ({
        contents: [{
            uri: "icecream-robot://state",
            mimeType: "application/json",
            text: JSON.stringify({
                hasGlass:           state.hasGlass,
                glassUnderFountain: state.glassUnderFountain,
                hasIceCream:        state.hasIceCream,
                selectedFlavor:     state.selectedFlavor,
                cherryCount:        state.cherryCount,
            }, null, 2),
        }],
    })
);

server.tool(
    "get_state",
    "Return the current state of the ice cream robot.",
    {},
    async () => ({
        content: [{
            type: "text",
            text: JSON.stringify({
                hasGlass:           state.hasGlass,
                glassUnderFountain: state.glassUnderFountain,
                hasIceCream:        state.hasIceCream,
                selectedFlavor:     state.selectedFlavor,
                cherryCount:        state.cherryCount,
            }, null, 2),
        }],
    })
);

server.tool(
    "pick_up_glass",
    "Pick up a clean, empty glass. Fails if the robot is already holding a glass.",
    {},
    async () => {
        if (state.hasGlass && !state.hasIceCream)
            return fail("Cannot pick up a glass: the robot is already holding an empty one!");
        if (state.hasGlass)
            return fail("Cannot pick up a glass: the robot is already holding a filled one. Give the current glass to the customer first.");
        state.hasGlass = true; state.glassUnderFountain = false;
        state.hasIceCream = false; state.cherryCount = 0;
        return ok("Picked up a clean, empty glass.");
    }
);

server.tool(
    "put_glass_under_fountain",
    "Place the currently held glass under the ice cream fountain. The robot must be holding an empty glass.",
    {},
    async () => {
        if (!state.hasGlass)
            return fail("Cannot place a glass under the fountain: the robot is not holding a glass. Pick one up first.");
        if (state.hasIceCream)
            return fail("Cannot place the glass under the fountain: the glass is not empty. Only an empty glass may be positioned there.");
        if (state.glassUnderFountain)
            return fail("The glass is already under the fountain.");
        state.glassUnderFountain = true;
        return ok("Glass placed under the ice cream fountain, ready to fill.");
    }
);

server.tool(
    "select_flavor",
    "Choose the ice cream flavour for the fountain. Valid flavours: chocolate, strawberry, mango.",
    { flavor: z.enum(["chocolate", "strawberry", "mango"]).describe("The ice cream flavour to select") },
    async ({ flavor }) => {
        state.selectedFlavor = flavor;
        return ok(`Fountain flavour set to "${flavor}".`);
    }
);

server.tool(
    "pump_ice_cream",
    "Pump ice cream from the fountain into the glass. A flavour must be selected and the glass must be positioned under the fountain.",
    {},
    async () => {
        if (!state.glassUnderFountain)
            return fail("Cannot pump ice cream: no glass is under the fountain. Pick up a glass and place it under the fountain first.");
        if (!state.selectedFlavor)
            return fail("Cannot pump ice cream: no flavour has been selected. Use select_flavor to choose one.");
        state.hasIceCream = true;
        return ok(`Pumped ${state.selectedFlavor} ice cream into the glass.`);
    }
);

server.tool(
    "add_cherry",
    "Place a cherry on top of the ice cream. Fails if there is no ice cream in the glass.",
    {},
    async () => {
        if (!state.hasIceCream)
            return fail("Cannot add a cherry: there is no ice cream in the glass. Pump ice cream first.");
        state.cherryCount += 1;
        return ok(`Cherry added. The glass now has ${state.cherryCount} ${state.cherryCount === 1 ? "cherry" : "cherries"}.`);
    }
);

server.tool(
    "give_ice_cream_to_customer",
    "Hand the finished ice cream to the customer. The glass must contain ice cream and have the correct number of cherries. Afterwards the robot's hand is empty and ready for the next order.",
    {},
    async () => {
        if (!state.hasIceCream)
            return fail("Cannot serve the customer: the glass does not contain ice cream. Pump ice cream into the glass first.");
        const flavor      = state.selectedFlavor;
        const cherries    = state.cherryCount;
        const cherryLabel = cherries === 0
            ? "no cherries"
            : `${cherries} ${cherries === 1 ? "cherry" : "cherries"}`;
        state.hasGlass = false; state.glassUnderFountain = false;
        state.hasIceCream = false; state.cherryCount = 0;
        return ok(`Served the customer: ${flavor} ice cream with ${cherryLabel}. The robot's hand is now empty.`);
    }
);

// ─── Shutdown ─────────────────────────────────────────────────────────────────

let shuttingDown = false;

async function shutdown(reason) {
    if (shuttingDown) return;
    shuttingDown = true;
    logInfo(`Shutting down (${reason}). Deregistering from web server...`);
    await stopSimulator();
    logInfo("Deregistered. Exiting.");
    process.exit(0);
}

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.stdin.on("close", () => shutdown("stdin closed"));

// ─── Start ────────────────────────────────────────────────────────────────────

logInfo("=".repeat(60));
logInfo("Ice Cream Robot MCP Server starting up.");
logInfo("=".repeat(60));

await startSimulator();

const transport = new StdioServerTransport();
await server.connect(transport);