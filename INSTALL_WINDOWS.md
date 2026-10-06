# Ice Cream Robot MCP Server — Windows Installation Guide

## Prerequisites

Before you begin, make sure you have the following installed:

**Node.js (v18 or later)**
Download and install from [https://nodejs.org](https://nodejs.org). Choose the LTS version. During installation, make sure **"Add to PATH"** is checked.

To verify your installation, open Command Prompt and run:
```
node --version
npm --version
```
Both commands should return a version number.

**Claude Desktop**
Download from [https://claude.ai/download](https://claude.ai/download) and install it.

---

## Step 1 — Set Up the Server Files

Create a folder for the server, for example:
```
C:\Users\YourName\icecream-robot\
```

Copy the following three files into that folder:
- `server.js`
- `package.json`
- `index.html` → place this inside a `public\` subfolder, so the path is:
  `C:\Users\YourName\icecream-robot\public\index.html`

Your folder structure should look like this:
```
icecream-robot\
├── server.js
├── package.json
└── public\
    └── index.html
```

---

## Step 2 — Install Dependencies

Open **Command Prompt**, navigate to your server folder, and run:
```
cd C:\Users\YourName\icecream-robot
npm install
```

This will download the required packages (`@modelcontextprotocol/sdk` and `zod`) into a `node_modules` folder.

---

## Step 3 — Find the Full Path to Node.js

Claude Desktop on Windows requires the **full path** to `node.exe`. Run this in Command Prompt to find it:
```
where node
```

It will return something like:
```
C:\Program Files\nodejs\node.exe
```

Make a note of this path — you'll need it in the next step.

---

## Step 4 — Configure Claude Desktop

Open the Claude Desktop configuration file. It is located at:
```
%APPDATA%\Claude\claude_desktop_config.json
```

You can navigate there by pressing **Win + R**, typing `%APPDATA%\Claude`, and pressing Enter. Open `claude_desktop_config.json` in any text editor (e.g. Notepad or VS Code). If the file doesn't exist, create it.

Add the following configuration, replacing the paths with your actual paths from Steps 1 and 3:

```json
{
  "mcpServers": {
    "icecream-robot": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "C:\\Users\\YourName\\icecream-robot\\server.js"
      ]
    }
  }
}
```

> **Important:** Use double backslashes (`\\`) in all Windows paths inside the JSON file.

If `claude_desktop_config.json` already has other MCP servers configured, add the `"icecream-robot"` block inside the existing `"mcpServers"` object — don't replace the whole file.

---

## Step 5 — Restart Claude Desktop

Fully quit Claude Desktop — don't just close the window. Right-click its icon in the **system tray** (bottom-right of your taskbar) and select **Quit**.

Then relaunch Claude Desktop from the Start menu.

---

## Step 6 — Verify the Connection

Once Claude Desktop has restarted, open a new chat. You should see a **hammer icon** (🔨) with a number at the bottom of the chat input box. Click it to confirm the following tools are listed:

- `pick_up_glass`
- `put_glass_under_fountain`
- `select_flavor`
- `pump_ice_cream`
- `add_cherry`
- `give_ice_cream_to_customer`

If you see these tools, the server is running correctly.

---

## Step 7 — View the Web UI (Optional)

The server also hosts a live status web interface at:
```
http://localhost:3000
```

Open this in your browser while chatting with Claude to watch the robot's state update in real time as Claude calls each tool.

---

## Troubleshooting

**The hammer icon doesn't appear after restarting**
- Double-check the paths in `claude_desktop_config.json` — every backslash must be doubled (`\\`).
- Confirm `node.exe` exists at the path you specified (`where node` in Command Prompt).
- Make sure `npm install` completed without errors in Step 2.

**Checking the logs**
Claude Desktop writes MCP server logs to:
```
%APPDATA%\Claude\logs\
```
Look for a file named `mcp-server-icecream-robot.log`. It will show any startup errors.

The server also writes its own log to `icecream-robot.log` in the server folder (`C:\Users\YourName\icecream-robot\`).

**Port 3000 is already in use**
The server handles this automatically — it will ask any previous instance to release the port. If problems persist, check what is using port 3000 with:
```
netstat -ano | findstr :3000
```
