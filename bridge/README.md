# @ropeman/bridge

WebSocket relay server for Ropeman AI bridge connections.

## Usage

```bash
npx @ropeman/bridge
npx @ropeman/bridge --port 9800
```

On startup the bridge prints a token. Paste it into the Bridge tab in Ropeman.

Bridge 0.2 requires this token, so upgrade the bridge and the Ropeman app together. An app from before 0.2 connects without a token and is refused.

## Security

The bridge runs your local CLI with the prompts it receives, so it only accepts connections that pass three checks:

- It listens on `127.0.0.1`. Other machines on the network cannot reach it.
- It refuses browser connections from any origin except `https://ropeman.dev` and local dev servers (`localhost` on ports 5173, 5174 and 4173, `127.0.0.1` on ports 5173 and 4173). Add more with `--allow-origin <url>`.
- Every connection must carry the token as `?token=` in the socket URL.

The token comes from, in order: `--token <value>`, the `ROPEMAN_BRIDGE_TOKEN` environment variable, or `~/.ropeman/bridge-token`. A token you set must be at least 16 characters, or the bridge refuses to start. Prefer the environment variable or the token file, because a `--token` value shows up in `ps` for other users on the machine.

The file is created on first run and reused afterwards. Delete it to issue a new token. The bridge sets the file to owner-only (`0600`) each time it starts. Windows ignores these permission bits, so there the file is protected by the access rules on your home folder.

| Flag                     | Description                              |
| ------------------------ | ---------------------------------------- |
| `--port <number>`        | Port to listen on (default 9800)         |
| `--cli <claude\|gemini>` | CLI to run (default: auto-detect)        |
| `--token <value>`        | Use this token instead of the stored one |
| `--allow-origin <url>`   | Also accept connections from this origin |

## Protocol

Messages use JSON format with `{ type, payload }` structure.

### Message Types

| Type      | Description                   |
| --------- | ----------------------------- |
| `ping`    | Health check (returns `pong`) |
| `status`  | Server status info            |
| `analyze` | Code analysis request         |
| `chat`    | Chat/conversation message     |

### Request Format

```json
{ "id": 1, "type": "chat", "message": "explain this code", "cli": "claude" }
```

`cli` is optional and must be `claude` or `gemini`.

### Response Format

```json
{ "id": 1, "type": "chat", "result": "..." }
```

## Development

```bash
cd bridge
npm install
npm run build
npm start
```
