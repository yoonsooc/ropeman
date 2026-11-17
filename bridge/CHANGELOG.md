# Changelog for @ropeman/bridge

Notable changes to the `@ropeman/bridge` npm package (the `ropeman` command) and the agent skill released with it at the same `bridge-v<version>` tag. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/) for 0.x: a minor release can change commands, flags or the map schema. Changes to ropeman.dev itself are listed on its [changelog page](https://ropeman.dev/docs/en/changelog).

## [Unreleased]

## [0.6.0] - 2026-11-17

### Added

- `ropeman map --input <graph file>` builds the map from a graph file another tool already wrote, such as Graphify's `graphify-out/graph.json`, instead of Ropeman's own extraction. Ropeman's extraction stays the default. When `ropeman map` finds a graph file, it asks on a terminal which input to use; without a terminal it writes nothing, lists the choices with their coverage on stdout and exits 2, so the agent asks the user. The choice is kept in `<folder>/input.json` for later runs, `ropeman verify` and serve. Only Graphify's `graph.json` (schema 1) is read. Graphicle, graf and graphify-csharp files are refused with the reason ([ADR-28](https://github.com/yoonsooc/ropeman/blob/main/docs/adr/0028-graph-file-as-chosen-input.md), [#145](https://github.com/yoonsooc/ropeman/pull/145)).

### Changed

- The parser engine is web-tree-sitter 0.27, and every language grammar the command loads is the build its upstream repository publishes with its latest release. Maps change where the old grammars misread code: C# files with a file-scoped `namespace X;` now list their classes and methods, Scala classes, objects and traits list their methods, Scala `new Foo(x)` counts as a call, and Swift, TSX and C files with constructs the old grammars could not parse read more of their symbols and calls ([ADR-27](https://github.com/yoonsooc/ropeman/blob/main/docs/adr/0027-grammars-from-upstream-releases.md), [#141](https://github.com/yoonsooc/ropeman/pull/141)).

## [0.5.0] - 2026-11-15

### Changed

- `ropeman serve` refuses an argument it does not read, such as a misspelled flag, `--port=9900` or a folder given without `--root`, and exits 1 with the usage. It used to ignore the argument and start with the defaults. It also refuses an option with no value, as in `--port --local` or a `--root` at the end, which used to take the next option as its value or fall back to the default ([#109](https://github.com/yoonsooc/ropeman/pull/109)).

### Fixed

- `ropeman serve --help` and `-h` print the usage and exit without starting a server or storing a token. A `--help` after `--`, or in place of an option's value, does not count as asking for help. `--help` after `map`, `verify`, `inbox` or `stop` prints the usage too, where it used to fail with exit code 2 ([#109](https://github.com/yoonsooc/ropeman/pull/109)).

### Security

- `ws`, the WebSocket library behind serve's local server, now has to be 8.21.0 or later. Earlier 8.x versions let a client exhaust the server's memory with many tiny fragments ([GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)) and could disclose uninitialized memory ([GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx)) ([#124](https://github.com/yoonsooc/ropeman/pull/124)).

## [0.4.0] - 2026-11-14

### Added

- Go and Rust imports resolve to files in the repository, so maps of Go and Rust projects get links between their parts ([#94](https://github.com/yoonsooc/ropeman/pull/94)).
- File levels. A part that holds two or more files in one folder gets a level of its files and the imports among them, marked `"fileLevel": true`. `ropeman.json` moves to schema 1.2 and is capped at 16 MiB: when it would be larger, `ropeman map` leaves out the largest file levels, serve still opens them on demand, and the new `fileLevels` field of the report lists what was dropped ([#96](https://github.com/yoonsooc/ropeman/pull/96)).
- Call and class-base relations. Calls and base classes whose target resolves to one declaration count as relations between parts, with a capped list of the lines behind each ([#98](https://github.com/yoonsooc/ropeman/pull/98)).

### Changed

- The viewer bundled for `--local` lays out each level to fit the screen shape ([#97](https://github.com/yoonsooc/ropeman/pull/97)).
- A viewer that reads only schema 1.1 shows a file level as a level whose names are still coming. Reload a ropeman.dev tab opened before the deploy (see Compatibility in [README.md](README.md#compatibility)).

### Fixed

- Two serve processes starting at the same moment no longer race to create `~/.ropeman/bridge-token`; the token file is written in one atomic step (the token-file part of [#100](https://github.com/yoonsooc/ropeman/pull/100)).

## [0.3.1] - 2026-11-13

### Added

- `ropeman serve --detach` starts serve in a session of its own, so it outlives the coding agent's shell, and records it in `<out>/serve.json`. Another `--detach` start with the same `--out` reuses it, and `ropeman stop --out <folder>` stops it. A detached serve stops itself after 60 idle minutes (`--idle-minutes`) ([#88](https://github.com/yoonsooc/ropeman/pull/88)).

### Fixed

- Files changed between the first walk of `--root` and the watchers opening are no longer missed ([#86](https://github.com/yoonsooc/ropeman/pull/86)).

## [0.3.0] - 2026-11-13

### Added

- `ropeman serve --root` maps a folder and serves it to the viewer over the map RPC (`map.get`, `node.expand`, `file.read`), names opened folders with a headless `claude` or `gemini` worker, and watches the folder for changes ([#78](https://github.com/yoonsooc/ropeman/pull/78)).
- The `ropeman.json` map schema, which ropeman.dev opens ([#75](https://github.com/yoonsooc/ropeman/pull/75)).
- `ropeman map`, `ropeman verify` and `ropeman inbox`, and the agent skill that uses them to name the top of a map and brief the workers ([#82](https://github.com/yoonsooc/ropeman/pull/82)).
- Local mode. `--local` serves the bundled viewer at `http://127.0.0.1:<port>/bridge` for Safari and for browsers that block the local-network connection ([#72](https://github.com/yoonsooc/ropeman/pull/72), [#79](https://github.com/yoonsooc/ropeman/pull/79)).

### Changed

- Every HTTP request and socket must carry `127.0.0.1:<port>` or `localhost:<port>` as its `Host`, which refuses DNS rebinding ([#72](https://github.com/yoonsooc/ropeman/pull/72)).

### Removed

- The chat relay that earlier versions ran for the web app ([#80](https://github.com/yoonsooc/ropeman/pull/80)).

## [0.2.0] - 2026-11-11

### Changed

- The bridge listens only on loopback and accepts a connection only from an allowed origin with the token from `~/.ropeman/bridge-token`. Apps from before 0.2 connect without a token and are refused ([#33](https://github.com/yoonsooc/ropeman/pull/33)).

## [0.1.0] - 2026-04-08

Initial release: a WebSocket relay that passes the web app's analysis and chat requests to an AI CLI on your machine.

[Unreleased]: https://github.com/yoonsooc/ropeman/compare/bridge-v0.6.0...HEAD
[0.6.0]: https://github.com/yoonsooc/ropeman/compare/bridge-v0.5.0...bridge-v0.6.0
[0.5.0]: https://github.com/yoonsooc/ropeman/compare/bridge-v0.4.0...bridge-v0.5.0
[0.4.0]: https://github.com/yoonsooc/ropeman/compare/bridge-v0.3.1...bridge-v0.4.0
[0.3.1]: https://github.com/yoonsooc/ropeman/compare/bridge-v0.3.0...bridge-v0.3.1
[0.3.0]: https://github.com/yoonsooc/ropeman/tree/bridge-v0.3.0
[0.2.0]: https://www.npmjs.com/package/@ropeman/bridge/v/0.2.0
[0.1.0]: https://www.npmjs.com/package/@ropeman/bridge/v/0.1.0
