# Ice Cream Robot MCP Server — Installation Guide (macOS)

## Prerequisites

You'll need **Node.js v18 or later**. Check if it's already installed:

```bash
node --version
```

If not installed, the easiest way is via [Homebrew](https://brew.sh):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node
```

Or download directly from [nodejs.org](https://nodejs.org).

---

## 1. Set Up the Project Folder

Create a directory for the server and set up the required folder structure:

```bash
mkdir icecream-robot-mcp
cd icecream-robot-mcp
mkdir public
```

---

## 2. Add the Files

Copy the provided files into the project folder as follows:

```
icecream-robot-mcp/
├── server.js        ← place here
├── package.json     ← place here
└── public/
    └── index.html   ← place here (inside the public folder)
```

> **Important:** `index.html` must go inside the `public/` subdirectory — the server serves static files from there.

---

## 3. Install Dependencies

From inside the `icecream-robot-mcp` directory, run:

```bash
npm install
```

This will install `@modelcontextprotocol/sdk` and `zod` as listed in `package.json`.

---

## 4. Run the Server

```bash
node server.js
```

Once running, the web UI is available at:

```
http://localhost:3000
```

A log file (`icecream-robot.log`) will be created in the project directory, recording all server activity.

To stop the server, press `Ctrl + C`.

---

## 5. Connect to Claude Desktop (MCP)

To use this as an MCP tool inside Claude Desktop, you need to register it in Claude's configuration file.

**Open the config file** (create it if it doesn't exist):

```bash
open ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Add the following** (replace `/absolute/path/to` with the real path to your project folder):

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

To find the absolute path of your project folder, run this from inside it:

```bash
pwd
```

**Restart Claude Desktop** after saving the config. The ice cream robot tools will then appear in Claude's tool list.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `node: command not found` | Install Node.js via Homebrew or nodejs.org |
| `Error: Cannot find module` | Run `npm install` inside the project folder |
| Port 3000 already in use | The server handles this automatically by asking the previous instance to shut down gracefully |
| Tools not showing in Claude | Check the path in `claude_desktop_config.json` is absolute (starts with `/`), then restart Claude |
| Permission denied on `server.js` | Run `chmod +x server.js` |
