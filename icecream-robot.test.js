/**
 * icecream-robot.test.js
 *
 * Tests for the ice-cream robot MCP server.
 *
 * Strategy: each test suite (describe block) gets its own server process so
 * state never leaks between suites.  Because every successful tool call has a
 * 1 s animation delay we set generous per-test timeouts and run as few tool
 * calls as necessary to prove each behaviour.
 *
 * The server is exercised entirely through its public MCP interface — no
 * internal modules are imported and no server code is modified.
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { McpTestClient } from "./mcp-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER    = path.join(__dirname, "server.js");

// How long (ms) to allow for a single tool call (1 s animation + headroom)
const TOOL_TIMEOUT = 5_000;
// How long for a whole test that chains several tool calls
const CHAIN_TIMEOUT = 30_000;

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Spin up a fresh server, return the client */
async function createClient() {
  const c = new McpTestClient(SERVER);
  await c.start();
  return c;
}

/** Run the complete happy-path sequence up to (and including) pump_ice_cream */
async function setupFilledGlass(client, flavor = "chocolate") {
  await client.callTool("pick_up_glass");
  await client.callTool("put_glass_under_fountain");
  await client.callTool("select_flavor", { flavor });
  await client.callTool("pump_ice_cream");
}

// ─── get_state / resource ─────────────────────────────────────────────────────

describe("get_state tool and robot-state resource", () => {
  let client;
  beforeAll(async () => { client = await createClient(); }, TOOL_TIMEOUT);
  afterAll(async  () => { await client.stop(); });

  it("returns valid JSON with all expected keys", async () => {
    const result = await client.callTool("get_state");
    expect(McpTestClient.isError(result)).toBe(false);
    const s = McpTestClient.json(result);
    expect(s).toMatchObject({
      hasGlass:           false,
      glassUnderFountain: false,
      hasIceCream:        false,
      selectedFlavor:     null,
      cherryCount:        0,
    });
  }, TOOL_TIMEOUT);

  it("resource returns the same initial state", async () => {
    const content = await client.readResource("icecream-robot://state");
    expect(content.mimeType).toBe("application/json");
    const s = JSON.parse(content.text);
    expect(s.hasGlass).toBe(false);
    expect(s.cherryCount).toBe(0);
  }, TOOL_TIMEOUT);
});

// ─── pick_up_glass ────────────────────────────────────────────────────────────

describe("pick_up_glass", () => {
  let client;
  beforeAll(async () => { client = await createClient(); }, TOOL_TIMEOUT);
  afterAll(async  () => { await client.stop(); });

  it("succeeds from the idle state", async () => {
    const r = await client.callTool("pick_up_glass");
    expect(McpTestClient.isError(r)).toBe(false);
    expect(McpTestClient.text(r)).toMatch(/picked up/i);
  }, TOOL_TIMEOUT);

  it("fails when already holding an empty glass", async () => {
    // Glass was picked up in the previous test (same server instance)
    const r = await client.callTool("pick_up_glass");
    expect(McpTestClient.isError(r)).toBe(true);
    expect(McpTestClient.text(r)).toMatch(/already holding an empty one/i);
  }, TOOL_TIMEOUT);

  it("reflects hasGlass=true in state after pick-up", async () => {
    const s = McpTestClient.json(await client.callTool("get_state"));
    expect(s.hasGlass).toBe(true);
    expect(s.hasIceCream).toBe(false);
  }, TOOL_TIMEOUT);
});

// ─── put_glass_under_fountain ─────────────────────────────────────────────────

describe("put_glass_under_fountain", () => {
  let client;
  beforeAll(async () => { client = await createClient(); }, TOOL_TIMEOUT);
  afterAll(async  () => { await client.stop(); });

  it("fails when no glass is held", async () => {
    const r = await client.callTool("put_glass_under_fountain");
    expect(McpTestClient.isError(r)).toBe(true);
    expect(McpTestClient.text(r)).toMatch(/not holding a glass/i);
  }, TOOL_TIMEOUT);

  it("succeeds after picking up a glass", async () => {
    await client.callTool("pick_up_glass");
    const r = await client.callTool("put_glass_under_fountain");
    expect(McpTestClient.isError(r)).toBe(false);
    expect(McpTestClient.text(r)).toMatch(/placed under the ice cream fountain/i);
  }, CHAIN_TIMEOUT);

  it("fails when the glass is already under the fountain", async () => {
    const r = await client.callTool("put_glass_under_fountain");
    expect(McpTestClient.isError(r)).toBe(true);
    expect(McpTestClient.text(r)).toMatch(/already under the fountain/i);
  }, TOOL_TIMEOUT);

  it("reflects glassUnderFountain=true in state", async () => {
    const s = McpTestClient.json(await client.callTool("get_state"));
    expect(s.glassUnderFountain).toBe(true);
  }, TOOL_TIMEOUT);

  it("fails when glass is not empty (ice cream already in it)", async () => {
    // Fill the existing glass then try to re-position it
    await client.callTool("select_flavor", { flavor: "mango" });
    await client.callTool("pump_ice_cream");

    // Give ice cream away so we can pick up a fresh glass
    await client.callTool("give_ice_cream_to_customer");

    // Now pick up a new glass, fill it, and try to place it under the fountain again
    await client.callTool("pick_up_glass");
    await client.callTool("put_glass_under_fountain");
    await client.callTool("select_flavor", { flavor: "mango" });
    await client.callTool("pump_ice_cream");       // glass is now non-empty

    // Move glass back out and try to place it again — it's not empty
    // (The server doesn't have a "remove from fountain" tool, so we verify the
    // non-empty guard by inspecting state directly.)
    const s = McpTestClient.json(await client.callTool("get_state"));
    expect(s.hasIceCream).toBe(true);

    const r = await client.callTool("put_glass_under_fountain");
    expect(McpTestClient.isError(r)).toBe(true);
    expect(McpTestClient.text(r)).toMatch(/not empty/i);
  }, CHAIN_TIMEOUT);
});

// ─── select_flavor ────────────────────────────────────────────────────────────

describe("select_flavor", () => {
  let client;
  beforeAll(async () => { client = await createClient(); }, TOOL_TIMEOUT);
  afterAll(async  () => { await client.stop(); });

  for (const flavor of ["chocolate", "strawberry", "mango"]) {
    it(`accepts "${flavor}"`, async () => {
      const r = await client.callTool("select_flavor", { flavor });
      expect(McpTestClient.isError(r)).toBe(false);
      expect(McpTestClient.text(r)).toMatch(flavor);
      const s = McpTestClient.json(await client.callTool("get_state"));
      expect(s.selectedFlavor).toBe(flavor);
    }, CHAIN_TIMEOUT);
  }

  it("can be changed to a different flavour", async () => {
    await client.callTool("select_flavor", { flavor: "chocolate" });
    await client.callTool("select_flavor", { flavor: "strawberry" });
    const s = McpTestClient.json(await client.callTool("get_state"));
    expect(s.selectedFlavor).toBe("strawberry");
  }, CHAIN_TIMEOUT);
});

// ─── pump_ice_cream ───────────────────────────────────────────────────────────

describe("pump_ice_cream", () => {
  let client;
  beforeAll(async () => { client = await createClient(); }, TOOL_TIMEOUT);
  afterAll(async  () => { await client.stop(); });

  it("fails when no glass is under the fountain", async () => {
    const r = await client.callTool("pump_ice_cream");
    expect(McpTestClient.isError(r)).toBe(true);
    expect(McpTestClient.text(r)).toMatch(/no glass is under the fountain/i);
  }, TOOL_TIMEOUT);

  it("fails when glass is in position but no flavour selected", async () => {
    await client.callTool("pick_up_glass");
    await client.callTool("put_glass_under_fountain");
    const r = await client.callTool("pump_ice_cream");
    expect(McpTestClient.isError(r)).toBe(true);
    expect(McpTestClient.text(r)).toMatch(/no flavour has been selected/i);
  }, CHAIN_TIMEOUT);

  it("succeeds when glass is in position and a flavour is selected", async () => {
    await client.callTool("select_flavor", { flavor: "chocolate" });
    const r = await client.callTool("pump_ice_cream");
    expect(McpTestClient.isError(r)).toBe(false);
    expect(McpTestClient.text(r)).toMatch(/chocolate ice cream/i);
  }, CHAIN_TIMEOUT);

  it("sets hasIceCream=true in state", async () => {
    const s = McpTestClient.json(await client.callTool("get_state"));
    expect(s.hasIceCream).toBe(true);
  }, TOOL_TIMEOUT);
});

// ─── add_cherry ───────────────────────────────────────────────────────────────

describe("add_cherry", () => {
  let client;
  beforeAll(async () => { client = await createClient(); }, TOOL_TIMEOUT);
  afterAll(async  () => { await client.stop(); });

  it("fails when there is no ice cream in the glass", async () => {
    const r = await client.callTool("add_cherry");
    expect(McpTestClient.isError(r)).toBe(true);
    expect(McpTestClient.text(r)).toMatch(/no ice cream/i);
  }, TOOL_TIMEOUT);

  it("succeeds once ice cream is in the glass and reports 1 cherry", async () => {
    await setupFilledGlass(client, "strawberry");
    const r = await client.callTool("add_cherry");
    expect(McpTestClient.isError(r)).toBe(false);
    expect(McpTestClient.text(r)).toMatch(/1 cherry/i);
  }, CHAIN_TIMEOUT);

  it("increments cherryCount correctly across multiple cherries", async () => {
    await client.callTool("add_cherry");
    await client.callTool("add_cherry");
    const s = McpTestClient.json(await client.callTool("get_state"));
    // Started at 1 from the previous test, added 2 more = 3
    expect(s.cherryCount).toBe(3);
  }, CHAIN_TIMEOUT);

  it("uses plural 'cherries' label for count > 1", async () => {
    const r = await client.callTool("add_cherry");
    expect(McpTestClient.text(r)).toMatch(/cherries/i);
  }, TOOL_TIMEOUT);
});

// ─── give_ice_cream_to_customer ───────────────────────────────────────────────

describe("give_ice_cream_to_customer", () => {
  let client;
  beforeAll(async () => { client = await createClient(); }, TOOL_TIMEOUT);
  afterAll(async  () => { await client.stop(); });

  it("fails when the glass has no ice cream", async () => {
    const r = await client.callTool("give_ice_cream_to_customer");
    expect(McpTestClient.isError(r)).toBe(true);
    expect(McpTestClient.text(r)).toMatch(/does not contain ice cream/i);
  }, TOOL_TIMEOUT);

  it("succeeds with ice cream and reports the correct flavour and cherry count", async () => {
    await setupFilledGlass(client, "mango");
    await client.callTool("add_cherry");
    await client.callTool("add_cherry");
    const r = await client.callTool("give_ice_cream_to_customer");
    expect(McpTestClient.isError(r)).toBe(false);
    expect(McpTestClient.text(r)).toMatch(/mango ice cream/i);
    expect(McpTestClient.text(r)).toMatch(/2 cherries/i);
  }, CHAIN_TIMEOUT);

  it("resets all state fields after serving the customer", async () => {
    const s = McpTestClient.json(await client.callTool("get_state"));
    expect(s.hasGlass).toBe(false);
    expect(s.glassUnderFountain).toBe(false);
    expect(s.hasIceCream).toBe(false);
    expect(s.cherryCount).toBe(0);
  }, TOOL_TIMEOUT);

  it("reports 'no cherries' when served plain", async () => {
    await setupFilledGlass(client, "chocolate");
    const r = await client.callTool("give_ice_cream_to_customer");
    expect(McpTestClient.text(r)).toMatch(/no cherries/i);
  }, CHAIN_TIMEOUT);

  it("uses singular 'cherry' in the confirmation message for exactly 1 cherry", async () => {
    await setupFilledGlass(client, "strawberry");
    await client.callTool("add_cherry");
    const r = await client.callTool("give_ice_cream_to_customer");
    // "1 cherry" not "1 cherries"
    expect(McpTestClient.text(r)).toMatch(/1 cherry(?!s)/i);
  }, CHAIN_TIMEOUT);
});

// ─── pick_up_glass after non-empty glass ─────────────────────────────────────

describe("pick_up_glass when holding a glass with ice cream", () => {
  let client;
  beforeAll(async () => { client = await createClient(); }, TOOL_TIMEOUT);
  afterAll(async  () => { await client.stop(); });

  it("fails with the 'already holding a filled one' message", async () => {
    await setupFilledGlass(client, "chocolate");
    const r = await client.callTool("pick_up_glass");
    expect(McpTestClient.isError(r)).toBe(true);
    // The glass is not empty, so we expect the generic "already holding one" error
    expect(McpTestClient.text(r)).toMatch(/already holding a filled one/i);
  }, CHAIN_TIMEOUT);
});

// ─── full order workflow (end-to-end) ────────────────────────────────────────

describe("full order workflow", () => {
  let client;
  beforeAll(async () => { client = await createClient(); }, TOOL_TIMEOUT);
  afterAll(async  () => { await client.stop(); });

  it("completes two back-to-back orders without errors", async () => {
    for (const [flavor, cherries] of [["chocolate", 2], ["strawberry", 0]]) {
      await client.callTool("pick_up_glass");
      await client.callTool("put_glass_under_fountain");
      await client.callTool("select_flavor", { flavor });
      await client.callTool("pump_ice_cream");
      for (let i = 0; i < cherries; i++) await client.callTool("add_cherry");
      const r = await client.callTool("give_ice_cream_to_customer");
      expect(McpTestClient.isError(r)).toBe(false);
      expect(McpTestClient.text(r)).toMatch(flavor);
    }

    // After both orders the robot should be idle again
    const s = McpTestClient.json(await client.callTool("get_state"));
    expect(s.hasGlass).toBe(false);
    expect(s.hasIceCream).toBe(false);
  }, CHAIN_TIMEOUT);

  it("flavor persists across orders until explicitly changed", async () => {
    // Select mango, complete an order
    await setupFilledGlass(client, "mango");
    await client.callTool("give_ice_cream_to_customer");

    // Start a new order *without* calling select_flavor
    await client.callTool("pick_up_glass");
    await client.callTool("put_glass_under_fountain");
    const r = await client.callTool("pump_ice_cream");

    expect(McpTestClient.isError(r)).toBe(false);
    expect(McpTestClient.text(r)).toMatch(/mango/i);
  }, CHAIN_TIMEOUT);
});
