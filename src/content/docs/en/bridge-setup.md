---
title: Bridge Setup
description: Run Ropeman against a local Claude Code or Gemini CLI installation
category: guides
order: 6
---

**Local Bridge** mode lets Ropeman use an AI CLI installed on your machine, **Claude Code** or **Gemini CLI**, for analysis. The browser talks to a small bridge server on your computer, the bridge runs your CLI, and the CLI calls its provider with its own login. Ropeman's servers are not on that path.

Use Local Bridge when you already pay for a CLI subscription, want to reuse its login, or need stricter data routing than Demo or API Key mode allows. It works on desktop only; on phones and tablets the card is disabled.

## What the bridge does

The bridge (`@ropeman/bridge` on npm) is a small Node process that runs a WebSocket server on `127.0.0.1`, port `9800` by default. For each request from Ropeman it receives the prompt with the code summary over the WebSocket connection, runs your CLI with that prompt (`claude -p` or `gemini -p`), and sends the CLI's full answer back when the CLI exits.

Before it accepts a connection, the bridge checks three things:

- It listens on `127.0.0.1` only, so other machines on your network cannot reach it.
- Browser connections must come from `https://ropeman.dev` or a local dev server (`localhost` on ports 5173, 5174 and 4173, `127.0.0.1` on ports 5173 and 4173). You can add origins with `--allow-origin`.
- Every connection must carry the token the bridge prints at startup.

The bridge writes nothing to disk except its token file. What the CLI keeps, such as its own session history, depends on the CLI.

## Prerequisites

- Node.js 18 or later
- At least one of:
  - [Claude Code](https://docs.claude.com/en/docs/claude-code), installed and signed in
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli), installed and signed in
- A terminal

Check that your CLI works on its own first:

```bash
claude --version
# or
gemini --version
```

## Running the bridge (no install required)

Run the bridge with `npx`, which downloads the package on first use and runs it without a global install:

```bash
npx @ropeman/bridge
```

Without `--cli`, the bridge checks for `claude` first, then `gemini`, and uses the first one it finds. The output looks like this, with a different token on your machine:

```text
[09:41:02] Using CLI: claude
[09:41:02] Ropeman Bridge server starting on ws://127.0.0.1:9800
[09:41:02] Bridge server ready on ws://127.0.0.1:9800
[09:41:02] Token: 3q2-7wEXAMPLEtokenEXAMPLEtokenEX
[09:41:02] Allowed origins: https://ropeman.dev, http://localhost:5173, ...
```

Copy the value after `Token:`. Leave the terminal open while you use Ropeman.

### The token

The bridge takes its token from the first of these that is set:

1. `--token <value>` on the command line
2. the `ROPEMAN_BRIDGE_TOKEN` environment variable
3. the file `~/.ropeman/bridge-token`

If none is set, the bridge creates `~/.ropeman/bridge-token` on first run and reuses it afterwards, so the token stays the same across restarts. It sets the file to owner-only (`0600`) each time it starts. Delete the file to get a new token. A token you supply through `--token` or the environment variable must be at least 16 characters, or the bridge refuses to start. Prefer the environment variable or the file over `--token`, because other users on the machine can see command-line arguments in `ps`.

### Options

| Flag                     | What it does                                         |
| ------------------------ | ---------------------------------------------------- |
| `--port <number>`        | Port to listen on (default `9800`)                   |
| `--cli <claude\|gemini>` | CLI to run (default: auto-detect)                    |
| `--token <value>`        | Use this token instead of the stored one             |
| `--allow-origin <url>`   | Also accept connections from this origin; repeatable |

```bash
# Use Claude Code even if Gemini CLI is also installed
npx @ropeman/bridge --cli claude

# Listen on another port
npx @ropeman/bridge --port 9900
```

### Alternative: global install

If you run the bridge often, install it globally instead:

```bash
npm install -g @ropeman/bridge
ropeman-bridge
```

## Connecting Ropeman

1. Open [ropeman.dev](https://ropeman.dev) and open a project folder.
2. Click **Analyze** in the header. The AI badge in the header and **Settings → AI Connection** open the same **AI Architecture Analysis** dialog.
3. Click the **Local Bridge** card to expand it.
4. Under **CLI Tool**, keep **Auto-detect** to use the CLI the bridge picked, or choose **Claude Code** or **Gemini CLI**.
5. Check that **Port** matches the bridge (`9800` unless you passed `--port`). Ropeman does not remember a changed port after a page reload.
6. Paste the token into the **Token** field. Ropeman keeps it in this browser for next time.
7. Click **Connect**. The card shows **Connected** when the bridge accepts the connection.
8. Click **Start with Bridge**.

Below the Token field, the card shows the `npx` command for the port and CLI you chose, ready to copy.

Requests now flow from the browser to the bridge on `127.0.0.1`, from the bridge to your CLI, and from the CLI to its provider.

## Verifying it works

- The header badge reads **Bridge** while Local Bridge is the active mode.
- The bridge terminal logs `Client connected from 127.0.0.1` when you connect. For each request it logs `Running claude CLI for [chat] id=1 (prompt: … chars)`, then `✓ CLI done id=1 (…s, response: … chars)`.

## Troubleshooting

### The card stays "Disconnected" after you click Connect

The browser cannot tell a missing bridge from a refused connection, so check the bridge terminal:

- No new log line means the bridge is not running or listens on another port. Compare the port in the terminal output with the card's **Port** field.
- `Rejected connection: missing or wrong token` means the token in the card does not match. Copy the `Token:` value again. If you deleted `~/.ropeman/bridge-token` or changed `ROPEMAN_BRIDGE_TOKEN`, the token changed.
- `Rejected connection from origin ... (not allowed)` means you opened Ropeman from an origin the bridge does not allow. Restart the bridge with `--allow-origin` and that origin:

  ```bash
  npx @ropeman/bridge --allow-origin https://your-origin.example
  ```

### "Cannot start: Token must be at least 16 characters."

The token from `--token` or `ROPEMAN_BRIDGE_TOKEN` is too short. Use a longer one, or unset both to use the token file.

### "Port 9800 is already in use"

Another process holds the port. Stop it, or run the bridge on another port (`--port 9900`) and enter the same number in the card's **Port** field.

### No CLI found

At startup the bridge prints `Warning: No CLI tool detected` when it finds neither `claude` nor `gemini` on your `PATH`. Analysis then fails with `No CLI tool available` or `CLI 'claude' not found`. Check:

```bash
which claude
which gemini
```

Install one of them or fix your `PATH`, then restart the bridge. On Windows, open a new terminal after installing so the `PATH` change takes effect.

### Requests time out

The bridge stops a CLI run after 120 seconds, and Ropeman gives up on a bridge request after 5 minutes. Large summaries make the CLI slower. Lower **Settings → Code Summary Size Limit** and try again.

Still stuck? See [Troubleshooting](/docs/en/troubleshooting), or [Security](/docs/en/security) for how data flows in each mode.
