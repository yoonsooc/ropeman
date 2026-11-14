---
title: Bridge Setup
description: Map a folder on your machine with ropeman serve, open it at ropeman.dev/bridge or in local mode, and let a headless Claude Code worker name its parts
category: guides
order: 6
---

**Bridge mode** shows a map of a folder on your machine. `ropeman serve` (npm package `@ropeman/bridge`) reads the folder, and the page at [ropeman.dev/bridge](https://ropeman.dev/bridge) connects to it over `ws://127.0.0.1:9800`. Click a folder to open it. Its subfolders and files show right away, and then a headless **Claude Code** worker (`claude -p`) names the parts. Click a file to open its source.

With the Ropeman skill installed, your coding agent runs these steps for you: ask it to "map this repo" and open the local mode address it gives you. See [Getting Started](/docs/en/getting-started). This page is for starting serve yourself.

Bridge mode runs on its own page. The main app's AI modes (Demo, API Key and WebGPU) are described in [AI Modes](/docs/en/ai-modes).

## What leaves your machine

When you open a folder, serve sends your CLI the structure of its parts: file paths, declared symbol names such as `function parseArgs`, and counts of files and of imports between the parts. The CLI never gets file contents or `.env` values. The CLI sends that structure to its own provider with its own login. Ropeman's servers are not on that path.

A file you open goes from serve to the page over `127.0.0.1`. serve refuses `.env` files with real values, binary files and files over 500 KB.

## Before you start

- Node.js 22 or later.
- Claude Code (`claude`), installed and signed in, to name the folders you open. Gemini CLI names them only when you start serve with `--cli gemini`. Without a CLI the map still works, and folders keep their folder names.
- Chrome, Edge or Firefox. Safari cannot connect from ropeman.dev, so in Safari start serve in [local mode](#use-local-mode).

## Start serve

Install the command once, then run serve in the folder you want to map:

```bash
npm install -g @ropeman/bridge@0.4.0
cd ~/code/your-project
ropeman serve --root .
```

Without a global install, `npx @ropeman/bridge@0.4.0 serve --root .` runs the same command. Older npm versions can fail to find the executable this way. Without `--cli`, serve uses `claude` when it is on your `PATH`. It never picks `gemini` on its own. The output looks like this:

```text
[09:41:02] Workers naming opened folders: claude
[09:41:02] Allowed origins: https://ropeman.dev, http://localhost:5173, ...
[09:41:02] Bridge server ready on ws://127.0.0.1:9800
[09:41:02] Open https://ropeman.dev/bridge and paste the token (stored in /Users/you/.ropeman/bridge-token).
[09:41:02] Map and file.read root: /Users/you/code/your-project
[09:41:02] Safari, or the browser blocked the connection? Start again with --local.
[09:41:02] Extracted 24 files of 24 listed in 0.05s
```

serve prints where the token is, not the token itself, so the value stays out of terminal logs. Copy it from the file:

```bash
cat ~/.ropeman/bridge-token
```

Leave the terminal open while you use the page.

## Connect from ropeman.dev

1. Open [ropeman.dev/bridge](https://ropeman.dev/bridge).
2. Keep **Port** at `9800`. If you started serve with `--port`, enter the same number.
3. Paste the token into **Token**.
4. Click **Connect**.
5. If the browser asks whether ropeman.dev may reach apps on this device, choose **Allow**.

The map appears when serve accepts the connection. The page keeps the token in memory and does not save it. After a reload, paste the token again.

## Allow the browser to reach serve

When a page on `https://ropeman.dev` reaches `127.0.0.1`, the browser treats it as a local network request. Each browser handles that request differently:

- **Chrome and Edge** ask once, through Chrome's Local Network Access permission (`loopback-network`). Choose **Allow**. While the prompt is open, the page says it is waiting for your answer.
- **Firefox** is starting to ask the same way in recent versions. Versions that do not ask connect right away.
- **Safari** blocks a secure page from reaching `ws://127.0.0.1` outright. Use [local mode](#use-local-mode).

### Reset a blocked permission

If you chose **Block**, or a policy blocked the request, the page says so. To allow it again:

- **Chrome.** Click the site controls icon to the left of the address, then **Site settings**. Set **Loopback network** (**Local network access** in older versions) to **Allow**, or click **Reset permissions**. Reload the page. You can also paste `chrome://settings/content/siteDetails?site=https://ropeman.dev` into the address bar.
- **Edge.** Click the lock icon to the left of the address, then **Permissions for this site**. Change the same setting and reload the page. You can also paste `edge://settings/content/siteDetails?site=https://ropeman.dev` into the address bar.
- **Firefox.** Click the permissions icon to the left of the address, clear the blocked **Device apps and services** entry, and reload the page.

These menu names were not checked in every browser version and may differ in yours.

## Use local mode

In local mode serve hosts the same viewer itself, so the page and serve share one origin. The browser shows no permission prompt, and the page makes no requests to other hosts. Local mode works in Safari too.

1. Stop serve with `Ctrl+C`.
2. Start it again with `--local`:

   ```bash
   ropeman serve --root . --local
   ```

3. Open the address serve prints, `http://127.0.0.1:9800/bridge#token=…`.

This address is the only place serve prints the token. The token comes after `#`, and the browser never sends that part to a server. A reload keeps working in that tab.

## Options

| Flag                     | What it does                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `--root <dir>`           | Map this folder, watch it, and let the page read files under it                      |
| `--port <number>`        | Port to listen on (default `9800`)                                                   |
| `--cli <claude\|gemini>` | CLI that names folders (default: `claude` when installed)                            |
| `--token <value>`        | Use this token instead of the stored one                                             |
| `--allow-origin <url>`   | Also accept connections from this origin                                             |
| `--local`                | Serve the viewer at `http://127.0.0.1:<port>/bridge` ([local mode](#use-local-mode)) |
| `--viewer <dir>`         | Serve this directory at `http://127.0.0.1:<port>/` instead                           |

Without `--root`, serve has no map and reads no files.

serve takes its token from the first of these that is set:

1. `--token <value>` on the command line
2. the `ROPEMAN_BRIDGE_TOKEN` environment variable
3. the file `~/.ropeman/bridge-token`

serve creates the file on first run and reuses it afterwards. It sets the file to owner-only (`0600`) each time it starts. Delete the file to get a new token. A token you set yourself must be at least 16 characters. Prefer the environment variable or the file over `--token`, because other users on the machine can see command-line arguments in `ps`.

## What serve accepts

serve runs your CLI and reads files under `--root`, so it accepts a connection only when all four checks pass:

- It listens on `127.0.0.1`. Other machines on your network cannot reach it.
- The `Host` header must be `127.0.0.1:<port>` or `localhost:<port>`. A site that points its own domain at `127.0.0.1` sends that domain as `Host` and is refused. The same check refuses tunnels and port forwards that rewrite `Host`, such as a Docker port mapping reached by a container name.
- Browser connections must come from `https://ropeman.dev` or a local dev server, unless you add an origin with `--allow-origin`. Add only origins you control. An origin that hosts other people's pages lets any of those pages run your CLI and read your files.
- Every connection must carry the token.

`claude` runs with no tools, no MCP servers and no saved session, from an empty temporary folder. Gemini CLI runs without its shell, edit, write and web fetch tools, with no MCP servers and no extensions, from the same kind of empty folder. [bridge/README.md](https://github.com/yoonsooc/ropeman/blob/main/bridge/README.md) has the full details.

## Troubleshooting

### The page cannot connect

When a connection fails, the page says which case it is:

- **The browser blocked the permission.** [Reset the permission](#reset-a-blocked-permission) and reload the page.
- **The permission prompt was not answered.** Click **Connect** again and choose **Allow**.
- **Nothing listens on the port.** serve is not running, or it runs on another port. Start serve, and check that **Port** matches the port in the terminal output.
- **serve refused the connection.** The token is wrong, or serve does not allow the page's address. The terminal running serve says which:
  - `Rejected connection: missing or wrong token`. Copy the token again with `cat ~/.ropeman/bridge-token`. If you deleted the file or changed `ROPEMAN_BRIDGE_TOKEN`, the token changed.
  - `Rejected connection from origin "..." (not allowed)`. Restart serve with `--allow-origin` and the page's address, which the card shows, for example `ropeman serve --root . --allow-origin https://preview.example.com`.
- **The connection did not go through, and the browser does not say why.** Firefox and Safari have no permission the page can read. The page then does not check the port, because that check could make the browser ask a second time. Check that serve runs on that port, that the token matches, that you did not block the site, and what serve's terminal says. If the page still cannot connect, use [local mode](#use-local-mode).

### "Port 9800 is already in use"

Another process holds the port. Stop it, or start serve on another port (`--port 9900`) and enter the same number in **Port**.

### "Cannot start: Token must be at least 16 characters."

The token from `--token` or `ROPEMAN_BRIDGE_TOKEN` is too short. Use a longer one, or unset both to use the token file.

### No CLI found

serve prints `Warning: claude not found, so opened folders keep folder names.` at startup when `claude` is not on your `PATH` and you did not pass `--cli` or `--out`. The map still works, and the page says that no CLI names the parts. Check:

```bash
which claude
```

Install Claude Code or fix your `PATH`, then restart serve. To use Gemini CLI instead, start serve with `--cli gemini`. On Windows, open a new terminal after installing so the `PATH` change takes effect.

### Folders keep their folder names

The page says why naming stopped:

- **The CLI did not finish naming.** The CLI failed, or it ran longer than 180 seconds. Check that the CLI runs and is signed in on its own.
- **The CLI's names failed the checks twice.** Ropeman checks the names against the code. Every part must get one name, and every key symbol must be declared in that part's files. serve asks again once with the reasons. After a second failure the folder names stay.

In both cases the map and the file view keep working.

### The page says serve has no map

serve was started without `--root`. Stop it and start it again with `--root .` in the folder you want to map.

Still stuck? See [Troubleshooting](/docs/en/troubleshooting), or [Security](/docs/en/security) for how data flows in the main app.
