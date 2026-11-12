# @ropeman/bridge

WebSocket relay server for Ropeman AI bridge connections.

## Usage

```bash
npx @ropeman/bridge
npx @ropeman/bridge --port 9900 --cli claude
```

The bridge listens on `ws://127.0.0.1:9800` unless you pass `--port`. Without `--cli` it checks for `claude`, then `gemini`, and uses the first one it finds.

On startup the bridge prints where its token is: `~/.ropeman/bridge-token` unless you set one with `--token` or `ROPEMAN_BRIDGE_TOKEN`. It does not print the token itself, so the value stays out of terminal logs. Copy it from that file (`cat ~/.ropeman/bridge-token`) into the Token field on the Local Bridge card in Ropeman (open the AI Architecture Analysis dialog with the Analyze button). If you changed the port, enter the same number in the card's Port field.

Bridge 0.2 requires this token, so upgrade the bridge and the Ropeman app together. An app from before 0.2 connects without a token and is refused.

## Security

The bridge runs your local CLI with the prompts it receives, so it only accepts connections that pass four checks:

- It listens on `127.0.0.1`. Other machines on the network cannot reach it.
- The `Host` header must be `127.0.0.1:<port>` or `localhost:<port>`, on the socket and on every HTTP request. A site that points its own domain at 127.0.0.1 (DNS rebinding) sends its domain as Host and is refused.
- It refuses browser connections from any origin except `https://ropeman.dev` and local dev servers (`localhost` on ports 5173, 5174 and 4173, `127.0.0.1` on ports 5173 and 4173). Add more with `--allow-origin <url>`.
- Every connection must carry the token as `?token=` in the socket URL.

The Host check also refuses tunnels and port forwards that rewrite Host, such as a Docker port mapping reached by a container name or a WSL forward reached as `<distro>.local`. Reach the bridge as `127.0.0.1:<port>` or `localhost:<port>` from the browser's machine.

Only add origins you control with `--allow-origin`. An origin that serves other people's pages, such as `https://htmlpreview.github.io` (used once to measure the browsers, see ADR-23), lets any page hosted there run your CLI and read files under `--root`.

The token comes from, in order: `--token <value>`, the `ROPEMAN_BRIDGE_TOKEN` environment variable, or `~/.ropeman/bridge-token`. A token you set must be at least 16 characters, or the bridge refuses to start. Prefer the environment variable or the token file, because a `--token` value shows up in `ps` for other users on the machine.

The file is created on first run and reused afterwards. Delete it to issue a new token. The bridge sets the file to owner-only (`0600`) each time it starts. Windows ignores these permission bits, so there the file is protected by the access rules on your home folder.

| Flag                     | Description                                                      |
| ------------------------ | ---------------------------------------------------------------- |
| `--port <number>`        | Port to listen on (default 9800)                                 |
| `--cli <claude\|gemini>` | CLI to run (default: auto-detect)                                |
| `--token <value>`        | Use this token instead of the stored one                         |
| `--allow-origin <url>`   | Also accept connections from this origin                         |
| `--root <dir>`           | Let `file.read` read files under this directory (off by default) |
| `--viewer <dir>`         | Serve this directory at `http://127.0.0.1:<port>/` (local mode)  |

## Local mode

With `--viewer <dir>` the bridge serves that directory's files, except dotfiles and dot directories (`.env`, `.git/`) and links to them, from the same port as the socket, and accepts `http://127.0.0.1:<port>` and `http://localhost:<port>` as origins. A page served this way talks to the bridge from its own origin, so browsers raise no mixed-content block and no local-network permission prompt. On startup the bridge prints `http://127.0.0.1:<port>/#token=…`, the only place it prints the token; the page reads the token from the hash, which the browser never sends to a server. Served files carry `frame-ancestors 'none'` so no other site can frame the page.

`probe/index.html` is a test page for this: `npm start -- --root .. --viewer probe`, then open the printed address. It reports `isSecureContext`, `crypto.subtle`, the local-network permission names the browser knows, and a few `file.read` calls.

## Protocol

Messages use JSON format with `{ type, payload }` structure.

### Message Types

| Type        | Description                   |
| ----------- | ----------------------------- |
| `ping`      | Health check (returns `pong`) |
| `status`    | Server status info            |
| `analyze`   | Code analysis request         |
| `chat`      | Chat/conversation message     |
| `file.read` | Read one file under `--root`  |

### Request Format

```json
{ "id": 1, "type": "chat", "message": "explain this code", "cli": "claude" }
```

`cli` is optional and must be `claude` or `gemini`.

```json
{ "id": 2, "type": "file.read", "path": "src/main.ts" }
```

`path` is relative to `--root`. The bridge refuses absolute paths, paths that leave the root (`..`, or a symlink that resolves outside it), env files with real values (`.env`, `.env.local`; templates such as `.env.example` are allowed), anything but a regular file (a directory, a FIFO, a device), files over 500,000 bytes, and files with a NUL byte (`binary`). A path that changes to point elsewhere while it is read comes back as `changed`. Each connection may have 8 reads in flight; more come back as `busy`. A refusal comes back as `{ "id": 2, "type": "file.read", "code": "outside-root", "error": "…" }`.

### Response Format

```json
{ "id": 1, "type": "chat", "result": "..." }
{ "id": 2, "type": "file.read", "result": { "path": "src/main.ts", "content": "...", "sha256": "…", "size": 1234 } }
```

## Development

```bash
cd bridge
npm install
npm run build
npm start
```
