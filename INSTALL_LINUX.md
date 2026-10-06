# Ice Cream Robot MCP Server — Installation Guide

## Prerequisites

You need **Node.js 18 or later**. To check your current version:

```bash
node --version
```

If Node.js is not installed, or your version is older than 18, install it via your package manager:

```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y nodejs npm

# Or use the NodeSource repo for the latest LTS version:
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## Installation

### 1. Create the project directory

```bash
mkdir icecream-robot && cd icecream-robot
```

### 2. Add the project files

Copy the following files into the project directory:

- `server.js`
- `package.json`

Then create a `public/` subdirectory and place `index.html` inside it — this is where the server expects to find the web UI:

```bash
mkdir public
# Place index.html inside public/
```

Your directory should look like this:

```
icecream-robot/
├── package.json
├── server.js
└── public/
    └── index.html
```

### 3. Install dependencies

```bash
npm install
```

This installs `@modelcontextprotocol/sdk` and `zod` as listed in `package.json`.

---

## Running the Server

The server communicates over **stdio** (for MCP) and also starts a small **HTTP server on port 3000** (for the web UI).

Start it directly with:

```bash
node server.js
```

Or use the npm script:

```bash
npm start
```

Once running, open your browser and visit:

```
http://localhost:3000
```

A log file named `icecream-robot.log` will be created automatically in the project directory.

---

## Connecting to an MCP Client

> **Note:** Claude Desktop is not available on Linux. You will need to use an alternative MCP client. Some options are listed below.

### Claude Code (CLI)

Anthropic's official CLI tool, **Claude Code**, supports MCP servers on Linux and is the recommended way to connect on this platform. Install it via npm:

```bash
npm install -g @anthropic-ai/claude-code
```

Then add the server to your Claude Code MCP configuration:

```bash
claude mcp add icecream-robot node /absolute/path/to/icecream-robot/server.js
```

### Other MCP-compatible clients

If you are using a different MCP client, the general pattern is to add an entry to the client's configuration file pointing to `server.js` using `node`:

```json
{
  "mcpServers": {
    "icecream-robot": {
      "command": "node",
      "args": ["/absolute/path/to/icecream-robot/server.js"]
    }
  }
}
```

Replace `/absolute/path/to/icecream-robot/` with the actual path to your project directory. You can find it by running `pwd` from inside the directory.

---

## Notes

- If port 3000 is already in use when the server starts, it will automatically ask any previous instance to release the port before retrying. No manual intervention is needed.
- The HTTP server is used only for the web UI — it is not required for MCP to function. If the port cannot be claimed, MCP will continue to work normally.
- To stop the server, press `Ctrl+C`.
