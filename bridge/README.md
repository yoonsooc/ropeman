# @ropeman/bridge

Local server for Ropeman. `ropeman serve` maps a folder on your machine and sends the map to the Ropeman viewer over a WebSocket. The coding agent you talk to names the top of the map through the Ropeman skill (`skill/ropeman/` in the Ropeman repository), with the `ropeman map`, `verify` and `inbox` commands below, and writes a brief. Deeper folders you open are named by a headless worker CLI that gets that brief: `claude -p` (Claude Code) when it is installed, or Gemini CLI with `--cli gemini`. With no worker CLI, the agent you talk to names them on its next turn.

## Usage

```bash
npm install -g @ropeman/bridge@0.6.0
ropeman serve --root . --out .ropeman --local
ropeman serve --root ~/code/project --port 9900 --cli claude
ropeman serve --root . --out .ropeman --local --detach
ropeman stop --out .ropeman
```

`npx @ropeman/bridge@0.6.0 serve --root .` runs the same command without a global install. Older npm versions can fail to find the executable that way, so the install above is the main form.

`ropeman serve` and `ropeman-bridge` are the same program. Without `--root` it has no map: `map.get` and `node.expand` answer `not-ready` and `file.read` is off.

`ropeman serve --help` (or `-h`) prints the usage and exits, and so does `--help` after `map`, `verify`, `inbox` or `stop`. serve does not start when an argument is wrong. It refuses an argument it does not read, such as a misspelled flag, `--port=9900` (write `--port 9900`) or a folder given without `--root`. It also refuses an option with no value, such as `--port --local`. Then it prints the usage and exits 1.

The bridge listens on `ws://127.0.0.1:9800` unless you pass `--port`. A folder you open that has no names yet goes to a worker: `claude`, found on PATH, or the CLI you pass with `--cli`. The bridge never picks `gemini` on its own: whether a wrapper may run it headless is unclear, so it runs only with `--cli gemini`. With `--out` (the skill's folder) the worker prompt carries your agent's brief, results are logged there, and with no worker the folder goes on the queue there for your agent (see Map files).

On startup the bridge prints where its token is: `~/.ropeman/bridge-token` unless you set one with `--token` or `ROPEMAN_BRIDGE_TOKEN`. It does not print the token itself, so the value stays out of terminal logs. Open https://ropeman.dev/bridge and paste the token from that file (`cat ~/.ropeman/bridge-token`) into the Token field. If you changed the port, enter the same number in the Port field. The page shows the map, opens a folder when you click it (its children right away, then their names once they pass the checks), and opens a file's source when you click the file.

Chrome and Edge ask once whether ropeman.dev may reach apps on this device; choose Allow. Firefox is rolling out the same prompt (Mozilla says from version 151). Safari blocks a secure page from reaching `ws://127.0.0.1` outright. When a connection fails, the page says which of these happened (permission blocked, nothing on the port, or the bridge refused the token) and how to fix it, including how to reset a blocked permission. If the browser cannot connect, start the bridge with `--local` and open the `http://127.0.0.1:<port>/bridge#token=…` address it prints instead (see Local mode).

`--detach` (needs `--out`) is how the skill starts serve. A coding agent's shell kills a long-running command when its time limit for background tasks runs out, so the command starts serve in a session of its own with its output in `<folder>/serve.log`, waits until it listens, prints the address and exits. serve writes `<folder>/serve.json` (pid, port, an instance id and a random secret, never the token) with mode 0600 once it listens, and removes it when it exits. Another `--detach` start with the same `--out` reuses the serve that answers for it and prints its address; one started with another `--root` or without the viewer it now asks for is stopped and replaced. Two such starts at the same moment take `<folder>/serve.lock` in turn, so they end with one serve and print the same address. `ropeman stop --out <folder>` asks that serve to stop over HTTP and waits for it. Both trust the record only when the serve on the recorded port answers a request that carries the record's secret, and neither ever signals a pid from the file, so a stale or planted record never stops another process. A record is removed only when nothing listens on its port (`stop` says so). When its port accepts connections but the record is not a private file of yours (a file system that keeps no modes reports `mode 644`), is not one this version reads, or nothing answers within 5 s (a busy serve), both commands keep the record, say why and what to do (`chmod 600 <folder>/serve.json`, stop the process on that port, or try again), exit 1, and start no second serve. On a file system that keeps no modes serve cannot keep its record private, so a detached serve there exits with a message and `--detach` fails; use an `--out` folder on a local disk. The printed address is always `127.0.0.1` and the recorded port. A start without `--detach` (in your terminal) runs as before, or fails with the port in use, and never stops another serve. A detached serve stops itself after 60 minutes with no page connected and no request that carries its secret; loading the viewer's files without the token does not count (`--idle-minutes <n>` changes it, `0` never stops, and then `serve.log` has no size bound); a serve in your terminal does not unless you pass `--idle-minutes`. The token appears only in the address the starting command prints, not in `serve.log`. On Windows `--detach` is untested; a serve that ends by a signal there skips its cleanup, so worker processes can outlive it.

Bridge 0.2 requires this token, so upgrade the bridge and the Ropeman app together. An app from before 0.2 connects without a token and is refused.

## Security

The bridge runs your local CLI to name folders and reads files under `--root`, so it only accepts connections that pass four checks:

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
| `--cli <claude\|gemini>` | Name opened folders with this CLI, headless (default: `claude` when installed)         |
| `--token <value>`        | Use this token instead of the stored one                                               |
| `--allow-origin <url>`   | Also accept connections from this origin                                               |
| `--root <dir>`           | Map this directory, watch it, and let `file.read` read files under it (off by default) |
| `--out <folder>`         | The folder shared with your agent: its names, its brief, the worker log and the queue  |
| `--local`                | Serve the viewer this package ships at `http://127.0.0.1:<port>/bridge` (local mode)   |
| `--viewer <dir>`         | Serve this directory at `http://127.0.0.1:<port>/` instead (local mode)                |

## Local mode

With `--viewer <dir>` the bridge serves that directory's files, except dotfiles and dot directories (`.env`, `.git/`) and links to them, from the same port as the socket, and accepts `http://127.0.0.1:<port>` and `http://localhost:<port>` as origins. A page served this way talks to the bridge from its own origin, so browsers raise no mixed-content block and no local-network permission prompt. On startup the bridge prints `http://127.0.0.1:<port>/bridge#token=…` (`/#token=…` for a `--viewer` directory without the Ropeman viewer), the only place it prints the token; the page reads the token from the hash, which the browser never sends to a server. Served files carry `frame-ancestors 'none'` so no other site can frame the page.

`probe/index.html` is a test page for this: `npm start -- --root .. --viewer probe`, then open the printed address. It reports `isSecureContext`, `crypto.subtle`, the local-network permission names the browser knows, and a few `file.read` calls.

## Map files

```bash
ropeman map --root <repo> --out <folder> [--depth <n>] [--input ropeman|<graph file>]
ropeman verify --root <repo> --map <ropeman.json> [--input ropeman|<graph file>]
ropeman inbox --out <folder>
```

Each file in the folder (`--out`) has one writer: the agent writes `names.json` and `brief.md`, `ropeman map` writes `ropeman.json`, `work.json` and `input.json`, serve writes `queue.json`, `naming-log.jsonl` and `serve.json`, `serve --detach` writes `serve.log` and holds `serve.lock` while it starts serve, and `ropeman inbox` writes `inbox-read.json`. A cloned repository can ship any of them, so Ropeman reads only regular files directly in the folder, never through a link and never past a size limit, and refuses an `--out` that is a link. Inside the repository the folder gets a `.gitignore` of `*`, so git does not commit it.

`ropeman map` extracts the repository and reads `<folder>/names.json`, an object keyed by node id whose values are `{ "label", "description", "keySymbols" }`, the fields serve asks its CLI for. A level gets names only when every one of its parts has an entry and the verifier passes the result. Every other level stays grouped, so the `ropeman.json` it writes always verifies. It also writes `work.json`, the parts to name next: the shallowest stage with no names yet (stage 1 is the top level, stage 2 the folders inside it, up to `--depth`, default 2) , every folder in `queue.json` (`"queued": true`), and every level whose names were refused. Each part lists its file count, up to 12 paths and up to 24 declared names, never file contents. The report on stdout is JSON: `done`, `coverage` (files listed, in the map, by reason), `stages`, `problems` (each with a `code`, the `level`, the `nodeId` and a message), `next` and `fileLevels`. The codes are the verifier's (`key-symbol-unknown`, `file-unassigned`, …) plus `names-unreadable`, `node-unknown`, `name-missing`, `name-invalid` and `map-invalid`. Exit code 0 means no problems, 1 problems, 2 bad arguments.

A part that holds two or more files directly in one folder (`files:<folder>`) gets a file level in `ropeman.json`: one `file:<path>` node per file and the imports between those files, marked `"fileLevel": true`. File levels are never named and never appear in `work.json`. `ropeman.json` must fit 16 MiB, the most any reader opens. When it would not, `ropeman map` leaves out the largest file levels until it fits and reports them in `fileLevels` (`written`, `dropped`, `droppedExamples`); serve still opens them on demand. When the map is over 16 MiB even without file levels, it writes nothing and exits with code 2.

`--out` may be outside the repository. Inside it, the folder must be one the walk skips, such as `.ropeman`, or the map would list its own files. Each run starts from the files on disk and replaces `ropeman.json` and `work.json` through a rename, so a run can be repeated or interrupted.

`ropeman verify` checks any `ropeman.json` against a fresh extraction of its input and prints `{ "input", "ok", "violations", "unverifiedEdges", "checked" }`, or `{ "ok": false, "failure" }` with the parser's code when the file is not a map it reads. The input is `--input`, else the choice recorded in `input.json` beside the map, else Ropeman's own extraction.

### Graph file input

By default `ropeman map` extracts the repository itself. A graph file that another tool already wrote can be the input instead, but only when the user chooses it. Ropeman never installs, downloads or runs that tool.

- `ropeman map` looks for `graphify-out/graph.json` and `.graphicle/graph.json` under `--root`. With `--input <file>` it reads that file instead, wherever it is. A file at a known location that is a link is not read.
- When it finds one and has no choice yet, it asks on a terminal: Ropeman's own extraction first, as the default (Enter), then each file with its size, modification time, writer and coverage. Without a terminal (stdin or stderr is not a TTY, as when a coding agent runs it), it writes no map files (it only creates the folder), prints `{ "done": false, "inputRequired", "choices" }` and exits 2. Each entry of `choices` has the `input` value to pass with `--input`, or `refused` with the reason the file cannot be used.
- The choice, from `--input` or the prompt, goes to `<folder>/input.json`, signed with a key kept in `~/.ropeman/input-key` and bound to that folder. A record without a valid signature, such as one a cloned repository ships or one copied from another folder, is refused, so a repository cannot choose an input for you. Later runs of `map`, `verify` beside that map, and `serve --out <folder>` use it until `--input` changes it. A recorded graph file that is gone or unreadable stops `map` and `verify` with exit 2 and serve with exit 1; Ropeman does not fall back to its own extraction. With no graph file and no choice, nothing is recorded and `ropeman map` behaves as before.
- Coverage compares the graph's code files with the code files on disk: source files in a language Ropeman parses, and every other file the graph holds. The report's `input.coverage` gives `covered` of `codeFiles`, the missing files by folder and extension, and the graph's files that are no longer on disk, which the map leaves out. Below 90% (`low`), the prompt, stderr and `input.warnings` say that the map shows only the files in the graph. A graph that holds no file on disk is refused.
- The map from a graph file goes through the same grouping, naming checks and verifier as one from Ropeman's own extraction, against the graph's code facts. Only the ast layer is read; the LLM-made semantic layer and the communities are not (ADR-28).
- Only Graphify's `graph.json` with `graph.schema_version` 1 and `graph.graphify_version` is read; it was checked against Graphify 0.9.104 output. Graphicle's `graph.json`, graf's `export graphify-json` and `export snapshot-json`, and graphify-csharp's `csharp.json` are refused with a reason that names the writer. Their formats were read from source only, with no real output file to check against.
- serve reads the recorded input when it starts. After changing the input, run `ropeman stop --out <folder>` and start serve again.

`ropeman inbox` prints `{ "queued": [...], "named": [...] }`: the folders in `queue.json` that `ropeman.json` still holds without names, and the worker results logged since the last `ropeman inbox` (node, folder, names, worker, time). serve drops a queued folder once it has names or no longer exists. Each log entry has a `seq` that only grows, and `inbox-read.json` keeps the last one shown, so trimming the log (serve keeps it under 1,000,000 bytes), restarting serve or removing the log never shows an entry twice or skips one. `ropeman inbox` refuses a folder with no `ropeman.json`.

`brief.md` is the agent's context for workers: the user's intent, terms, naming conventions and the names of the levels above. serve puts its first 4,000 bytes into each worker prompt, with the name the folder got one level up.

`ropeman serve --out <folder>` serves the named levels of `<folder>/ropeman.json`, the top level included, and reads the file again each time `ropeman map` replaces it. A queued folder that gets names is pushed to the pages waiting for it as `node.named`; other changed levels arrive as `map.changed` with no paths. A level whose names no longer pass on the current code (a key symbol was removed, a folder was added) goes back to grouped. An `--out` inside `--root` must be a folder the walk skips, as for `ropeman map`.

## Protocol

Messages are JSON. The map RPC (`map.get`, `node.expand`, `file.read`) and its pushes follow the `ropeman.json` schema 1.2; the types are in `src/lib/types/ropemanMap.ts` of the Ropeman repository. Every request is parsed before it runs. A request the parser refuses (an unknown type, a missing field, text that is not JSON) gets `{ "id", "type", "code": "bad-request", "error" }` and the connection stays open.

The first message on every connection is `{ "type": "hello", "schemaVersion": "1.2", "server": { "name", "version" } }`.

| Request                                     | Answer                                                                                                                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ "id", "type": "map.get" }`               | The map of `--root`: every file with where it ended up, the top level grouped by folder, and each level named so far                                                                                             |
| `{ "id", "type": "node.expand", "nodeId" }` | At once, the node's level grouped by folder (or its named level when it has one). Then one `node.named` push: the named level, or a code and the reason. A `files:` node answers with its file level and no push |
| `{ "id", "type": "file.read", "path" }`     | One file under `--root` (below)                                                                                                                                                                                  |

Pushes: `node.named` (`{ nodeId, level, namedBy? }`, where 1.1 adds `namedBy: { worker, runs }` for a worker's names, or `{ nodeId, code, error }` with code `queued`, `no-cli`, `naming-failed` or `verification-failed`) and `map.changed` (`{ paths }`, after a file under `--root` changes; ask `map.get` again).

### Naming with a worker

With `--out` and no worker CLI, `node.named` for a folder without names is `{ nodeId, code: "queued", error }`, and the named level follows once your agent names it. Otherwise, when a folder is expanded, the bridge sends your CLI the structure of its parts: file paths, declared names such as `function parseArgs`, file counts, and the links between the parts with the number of import statements behind each (a link can also rest on calls or class bases alone). It sends no file contents, and env files with real values are not in the map at all. The CLI answers with a name, a sentence and up to six key symbols per part. Ropeman's verifier checks the answer against the code (every part named once, key symbols declared in that part's files); an answer that fails is asked again once with the reasons, then the folder names stay and the push says why. `claude` runs with no tools, no MCP servers and no saved session, from an empty temporary folder. Gemini CLI has no flag that turns every tool off: the bridge runs it with `--approval-mode default` (no shell, edit, write or web fetch in headless mode), no MCP servers and no extensions, so only its read and search tools remain, and those see only the empty folder. At most two CLI runs go at once, each for at most 180 seconds; closing the page stops the run it was waiting for. Stopping a run, or the bridge, ends the CLI and every process it started (its process group on macOS and Linux, `taskkill /T` on Windows, which is untested).

### file.read

```json
{ "id": 2, "type": "file.read", "path": "src/main.ts" }
```

`path` is relative to `--root`. The bridge refuses absolute paths, paths that leave the root (`..`, or a symlink that resolves outside it), env files with real values (`.env`, `.env.local`; templates such as `.env.example` are allowed), anything but a regular file (a directory, a FIFO, a device), files over 500,000 bytes, and files with a NUL byte (`binary`). A path that changes to point elsewhere while it is read comes back as `changed`. Each connection may have 8 reads in flight; more come back as `busy`. A refusal comes back as `{ "id": 2, "type": "file.read", "code": "outside-root", "error": "…" }`, a file as `{ "id": 2, "type": "file.read", "result": { "path", "content", "sha256", "size" } }`.

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

## Compatibility

Bridge 0.4.0 and later write and serve schema 1.2, which adds `fileLevel` to a level. A viewer that reads 1.1 drops the field and shows a file level as a level whose names are still coming, with the files and their imports drawn as usual. Merging to the Ropeman repository deploys ropeman.dev before a bridge release goes out, and `serve --local` hosts the viewer of its own build, so this shows only in a ropeman.dev tab opened before the deploy. Reloading the tab fixes it.

## Changelog

Changes in each release are in [CHANGELOG.md](CHANGELOG.md). How a release is cut is in [RELEASING.md](https://github.com/yoonsooc/ropeman/blob/main/RELEASING.md).
