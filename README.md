# 🍦 Ice Cream Robot MCP Server

An MCP (Model Context Protocol) server that simulates a robot capable of serving ice cream. The robot enforces a realistic workflow and logs every action and error to `icecream-robot.log`.

---

## Installation

```bash
npm install
```

---

## Running the server

```bash
node server.js
```

The server communicates over **stdio**, which is the standard transport for MCP servers.

---

## Connecting to Claude Desktop

Add the following block to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "icecream-robot": {
      "command": "node",
      "args": ["/absolute/path/to/icecream-robot-mcp/server.js"]
    }
  }
}
```

Replace `/absolute/path/to/icecream-robot-mcp/` with the actual path to this folder.

---

## Available Tools

| Tool | Description | Pre-conditions |
|---|---|---|
| `pick_up_glass` | Pick up a clean empty glass | Robot must **not** already be holding a glass |
| `put_glass_under_fountain` | Place the held glass under the ice cream fountain | Robot must be holding an **empty** glass |
| `select_flavor` | Choose a flavour: `chocolate`, `strawberry`, or `mango` | None |
| `pump_ice_cream` | Pump ice cream into the glass | Glass must be **under the fountain** and a **flavour** must be selected |
| `add_cherry` | Add a cherry on top | Glass must **contain ice cream** |
| `give_ice_cream_to_customer` | Hand the finished ice cream to the customer | Glass must **contain ice cream** |

---

## Robot State

The server tracks the following state between tool calls:

| Field | Type | Description |
|---|---|---|
| `hasGlass` | boolean | Whether the robot is holding a glass |
| `glassUnderFountain` | boolean | Whether the glass is positioned under the fountain |
| `glassIsEmpty` | boolean | Whether the glass has not yet had ice cream pumped in |
| `hasIceCream` | boolean | Whether ice cream has been pumped into the glass |
| `selectedFlavor` | string \| null | The currently selected fountain flavour |
| `cherryCount` | number | Number of cherries added to the current serving |

---

## Typical Happy Path

```
1. pick_up_glass
2. select_flavor          { flavor: "chocolate" }
3. put_glass_under_fountain
4. pump_ice_cream
5. add_cherry             (optional, repeat as desired)
6. give_ice_cream_to_customer
```

---

## Logging

All actions and errors are appended to **`icecream-robot.log`** in the same directory as `server.js`. Each line looks like:

```
[2025-05-01T10:23:45.123Z] [INFO ] Pumped chocolate ice cream into the glass.  [state] hasGlass=true | underFountain=true | empty=false | hasIceCream=true | flavor=chocolate | cherries=0
[2025-05-01T10:23:46.500Z] [ERROR] Cannot add a cherry: there is no ice cream in the glass. Pump ice cream first.  [state] hasGlass=true | underFountain=true | empty=false | hasIceCream=false | flavor=chocolate | cherries=0
```
