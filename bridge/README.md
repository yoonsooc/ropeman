# @ropeman/bridge

Local server for Ropeman. `ropeman serve` maps a folder on your machine, sends the map to the Ropeman viewer over a WebSocket, and names the folders you open with your own CLI (Claude Code or Gemini CLI).

## Usage

```bash
npx @ropeman/bridge serve --root .
npx @ropeman/bridge serve --root ~/code/project --port 9900 --cli claude
```

`ropeman serve` and `ropeman-bridge` are the same program. Without `--root` it only relays the app's chat requests to the CLI.

The bridge listens on `ws://127.0.0.1:9800` unless you pass `--port`. Without `--cli` it checks for `claude`, then `gemini`, and uses the first one it finds.

On startup the bridge prints where its token is: `~/.ropeman/bridge-token` unless you set one with `--token` or `ROPEMAN_BRIDGE_TOKEN`. It does not print the token itself, so the value stays out of terminal logs. Open https://ropeman.dev/bridge and paste the token from that file (`cat ~/.ropeman/bridge-token`) into the Token field. If you changed the port, enter the same number in the Port field. The page shows the map, opens a folder when you click it (its children right away, the CLI's names when they pass the checks), and opens a file's source when you click the file.

Safari blocks a secure page from reaching `ws://127.0.0.1`, and Chrome and Edge ask first. If that does not work, start the bridge with `--local` and open the `http://127.0.0.1:<port>/bridge#token=…` address it prints instead (see Local mode).

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

| Flag                     | Description                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `--port <number>`        | Port to listen on (default 9800)                                                       |
| `--cli <claude\|gemini>` | CLI to run (default: auto-detect)                                                      |
| `--token <value>`        | Use this token instead of the stored one                                               |
| `--allow-origin <url>`   | Also accept connections from this origin                                               |
| `--root <dir>`           | Map this directory, watch it, and let `file.read` read files under it (off by default) |
| `--local`                | Serve the viewer this package ships at `http://127.0.0.1:<port>/bridge` (local mode)   |
| `--viewer <dir>`         | Serve this directory at `http://127.0.0.1:<port>/` instead (local mode)                |

## Local mode

With `--viewer <dir>` the bridge serves that directory's files, except dotfiles and dot directories (`.env`, `.git/`) and links to them, from the same port as the socket, and accepts `http://127.0.0.1:<port>` and `http://localhost:<port>` as origins. A page served this way talks to the bridge from its own origin, so browsers raise no mixed-content block and no local-network permission prompt. On startup the bridge prints `http://127.0.0.1:<port>/bridge#token=…` (`/#token=…` for a `--viewer` directory without the Ropeman viewer), the only place it prints the token; the page reads the token from the hash, which the browser never sends to a server. Served files carry `frame-ancestors 'none'` so no other site can frame the page.

`probe/index.html` is a test page for this: `npm start -- --root .. --viewer probe`, then open the printed address. It reports `isSecureContext`, `crypto.subtle`, the local-network permission names the browser knows, and a few `file.read` calls.

## Protocol

Messages are JSON. The map RPC (`map.get`, `node.expand`, `file.read`) and its pushes follow the `ropeman.json` schema 1.0; the types are in `src/lib/types/ropemanMap.ts` of the Ropeman repository. Every request is parsed before it runs. A request the parser refuses (an unknown type, a missing field, text that is not JSON) gets `{ "id", "type", "code": "bad-request", "error" }` and the connection stays open.

The first message on every connection is `{ "type": "hello", "schemaVersion": "1.0", "server": { "name", "version" } }`.

| Request                                     | Answer                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ "id", "type": "map.get" }`               | The map of `--root`: every file with where it ended up, the top level grouped by folder, and each level named so far                                    |
| `{ "id", "type": "node.expand", "nodeId" }` | At once, the node's level grouped by folder (or its named level when it has one). Then one `node.named` push: the named level, or a code and the reason |
| `{ "id", "type": "file.read", "path" }`     | One file under `--root` (below)                                                                                                                         |

Pushes: `node.named` (`{ nodeId, level }` or `{ nodeId, code, error }` with code `no-cli`, `naming-failed` or `verification-failed`) and `map.changed` (`{ paths }`, after a file under `--root` changes; ask `map.get` again).

### Naming

When a folder is expanded, the bridge sends your CLI the structure of its parts: file paths, declared names such as `function parseArgs`, file counts and import counts between the parts. It sends no file contents, and env files with real values are not in the map at all. The CLI answers with a name, a sentence and up to six key symbols per part. Ropeman's verifier checks the answer against the code (every part named once, key symbols declared in that part's files); an answer that fails is asked again once with the reasons, then the folder names stay and the push says why. `claude` runs with no tools, no MCP servers and no saved session, from an empty temporary folder. Gemini CLI has no flag that turns every tool off: the bridge runs it with `--approval-mode default` (no shell, edit, write or web fetch in headless mode), no MCP servers and no extensions, so only its read and search tools remain, and those see only the empty folder. At most two CLI runs go at once, each for at most 180 seconds; closing the page stops the run it was waiting for. Stopping a run, or the bridge, ends the CLI and every process it started (its process group on macOS and Linux, `taskkill /T` on Windows, which is untested).

### file.read

```json
{ "id": 2, "type": "file.read", "path": "src/main.ts" }
```

`path` is relative to `--root`. The bridge refuses absolute paths, paths that leave the root (`..`, or a symlink that resolves outside it), env files with real values (`.env`, `.env.local`; templates such as `.env.example` are allowed), anything but a regular file (a directory, a FIFO, a device), files over 500,000 bytes, and files with a NUL byte (`binary`). A path that changes to point elsewhere while it is read comes back as `changed`. Each connection may have 8 reads in flight; more come back as `busy`. A refusal comes back as `{ "id": 2, "type": "file.read", "code": "outside-root", "error": "…" }`, a file as `{ "id": 2, "type": "file.read", "result": { "path", "content", "sha256", "size" } }`.

### Chat relay

The Ropeman app's Local Bridge track sends `{ "id": 1, "type": "chat", "message": "…", "cli": "claude" }` and gets `{ "id": 1, "type": "chat", "result": "…" }`. `analyze`, `ping` and `status` are also kept. `cli` is optional and must be `claude` or `gemini`. Relay runs use the same CLI flags, empty working folder and limits as naming: two CLI runs at a time across the server, four waiting per connection (namings and relays together), 120 seconds and 1 MB of output per run, and a closed connection stops its runs. This relay goes away once the viewer uses the map RPC.

## Development

The bridge bundles the extraction core and the map schema from the Ropeman repository, so it builds from the repository root:

```bash
npm ci && npm ci --prefix bridge
npm run check:bridge
npm run build:bridge          # bridge/dist/server.mjs and bridge/dist/wasm/
npm run build && npm run bundle:viewer   # bridge/dist/viewer/ for --local
node bridge/dist/server.mjs serve --root .
node bridge/scripts/smoke.mjs bridge/dist/server.mjs tests/fixtures/graphs/ts-monorepo
```
