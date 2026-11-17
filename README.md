# Ropeman

> Map a repository from your coding agent. Ropeman extracts every file, symbol and import without a model, your agent names the parts, and a verifier checks each name against the code.

**Live**: [https://ropeman.dev](https://ropeman.dev)

[한국어](./README-KO.md)

## Use it from your coding agent

Install the `ropeman` command, then save the skill in the folder your agent loads skills from. Run the `curl` line for your agent:

```bash
npm install -g @ropeman/bridge@0.7.0     # the ropeman command, Node 22 or later

# Claude Code (tested)
curl --create-dirs -fsSLo ~/.claude/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.7.0/skill/ropeman/SKILL.md
# Codex (not tested)
curl --create-dirs -fsSLo ~/.agents/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.7.0/skill/ropeman/SKILL.md
# Gemini CLI (not tested)
curl --create-dirs -fsSLo ~/.gemini/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.7.0/skill/ropeman/SKILL.md
# Cursor (not tested)
curl --create-dirs -fsSLo ~/.cursor/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.7.0/skill/ropeman/SKILL.md
```

Then ask your agent to "map this repo". It builds the map, names the top two levels, checks them, starts `ropeman serve` and gives you a `http://127.0.0.1:9800/bridge#token=…` address. Open it in your browser: click a folder to drill down, click a file to read its source. [The work folder](https://ropeman.dev/docs/en/getting-started#the-work-folder) shows which files the agent and `ropeman serve` keep, and which of them you can edit.

The skill is tested with Claude Code. Codex, Gemini CLI and Cursor load skills from these folders according to their own documentation, but Ropeman has not been tested with them yet. For another agent, save the file as `ropeman/SKILL.md` in the folder that agent loads skills from. If your agent has no skill support, paste the text of `SKILL.md` into the conversation. The details are in [`skill/README.md`](skill/README.md). The commands are for macOS, Linux and WSL shells.

The browser app below stays available without an install: open a folder or a GitHub repository at ropeman.dev, or open a `ropeman.json`.

## Overview

Ropeman parses a codebase in the browser and asks an AI to group its files by role. The main canvas shows those groups and the dependencies between them, so you see the architecture before the file tree.

Open a folder and you get a diagram. Double-click a group to drill down, and the AI analyzes that group's inner structure on request.

### Highlights

- The main canvas is a diagram of roles. The file tree is a side panel.
- Drill-down is recursive. Each level is a new AI analysis of one group.
- Source code stays in the browser. The AI receives only a code summary, called the skeleton: symbols, signatures and imports, and for Markdown files the frontmatter name and description, headings and file links.
- Demo mode needs no install and no account. Open the site, open a folder, and the diagram appears.

## Features

- AI analysis that turns the skeleton into an architecture diagram
- Recursive drill-down into any node
- Four AI modes, described below
- WASM AST parsing in the browser, so only skeletons reach the AI
- 14 languages: Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C# and Scala
- Public GitHub repositories load by URL, without a clone
- Code viewer with syntax highlighting and split view
- Code snippet analysis: paste code and analyze it directly
- Analysis cache in the Cache API, kept across sessions
- Full-text and semantic search with Orama

## Tech Stack

| Area            | Technology                         |
| --------------- | ---------------------------------- |
| Framework       | SvelteKit + Svelte 5 (runes)       |
| Graph Rendering | @xyflow/svelte (SvelteFlow)        |
| Graph Layout    | @dagrejs/dagre                     |
| AST Parsing     | web-tree-sitter (WASM, Web Worker) |
| Search          | @orama/orama                       |
| WebGPU AI       | @mlc-ai/web-llm                    |
| Edge Proxy      | Cloudflare Workers                 |
| Testing         | Vitest + Playwright                |
| Build           | Vite v6                            |
| Deploy          | Cloudflare Pages                   |

## Getting Started

```bash
git clone https://github.com/yoonsooc/ropeman.git
cd ropeman
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in Chrome or Edge. Folder picking uses the File System Access API, which only Chromium browsers support in full.

### Scripts

| Command                     | Description                                             |
| --------------------------- | ------------------------------------------------------- |
| `npm run dev`               | Start dev server                                        |
| `npm run build`             | Production build                                        |
| `npm run preview`           | Build, then serve it with Cloudflare Pages on port 8788 |
| `npm run test:unit`         | Run unit tests (Vitest)                                 |
| `npm run test:e2e`          | Run E2E tests (Playwright)                              |
| `npm run lint`              | Lint with ESLint                                        |
| `npm run format`            | Format with Prettier                                    |
| `npm run deploy`            | Deploy Pages app to Cloudflare                          |
| `npm run deploy:edge:demo`  | Deploy edge demo Worker                                 |
| `npm run deploy:edge:proxy` | Deploy edge proxy Worker                                |

Before you contribute, read [CONTRIBUTING.md](CONTRIBUTING.md) for setup and what a pull request needs, and [AGENTS.md](AGENTS.md) for the repository layout, conventions, tests, and when a change needs an ADR. Coding agents read AGENTS.md too.

## AI Modes

Ropeman has three AI modes:

1. **Demo** is free and needs no setup. Requests go through Ropeman's edge proxy, which rate-limits them, to the Google Gemini free tier. Google may use free-tier inputs to improve its products.
2. **API Key (BYOK)** uses your own Google Gemini, Anthropic or OpenAI key. The key stays in the browser (localStorage). Gemini requests go straight to Google. Anthropic and OpenAI requests pass through Ropeman's edge proxy because of browser restrictions, and the proxy does not store keys.
3. **Browser AI** runs a model in the browser with WebGPU through web-llm. After the one-time model download, analysis runs offline. This mode is experimental.

**Bridge mode** runs outside these modes, on its own page. `ropeman serve` maps a folder on your machine, and https://ropeman.dev/bridge connects to it over `ws://127.0.0.1:9800`. Your coding agent names the top levels. A headless worker CLI (`claude`, or `gemini` with `--cli gemini`) names the parts of each folder you open. Without a worker CLI, your agent names them on your next message. Click a file to open its source. Your code does not go to Ropeman's servers. To start serve yourself, install it with `npm install -g @ropeman/bridge@0.7.0`, run `ropeman serve --root .` in the project folder, open https://ropeman.dev/bridge, and paste the token from `~/.ropeman/bridge-token`. In Safari, or if the browser blocked the connection, start serve with `--local` and open the address it prints. [bridge/README.md](bridge/README.md) covers the flags, the token and the security checks.

## Architecture

```
src/lib/
  stores/       # Svelte 5 rune singletons (module-level)
  services/     # Pure functions, AI adapter, caching
  components/   # Svelte 5 components ($props pattern)
  workers/      # Web Workers (AST parser, web-llm)
  types/        # TypeScript interfaces
  utils/        # Utilities (language detection, etc.)

workers/
  src/          # Cloudflare Workers (proxy, demo, explore, share)

experiments/
  code-qa-eval/ # Python retrieval experiment, not part of the app or bridge
```

### Data Flow

1. User drops a folder (File System Access API)
2. Parser Worker (web-tree-sitter WASM) extracts AST skeletons per file
3. AI adapter sends skeletons to the selected AI track
4. Response is parsed into semantic nodes/edges and rendered via SvelteFlow
5. The Cache API keeps results, so reopening a project skips the AI call

## Caching

| Data              | Storage           | Key                |
| ----------------- | ----------------- | ------------------ |
| Semantic analysis | Cache API         | `ropeman/semantic` |
| Chat responses    | IndexedDB (Orama) | `ropeman-cache`    |
| WebGPU models     | Cache API         | `webllm/*`         |

## Keyboard Shortcuts

| Shortcut       | Action                            |
| -------------- | --------------------------------- |
| `Ctrl+K`       | Search                            |
| `Ctrl+Shift+D` | Toggle theme                      |
| `Ctrl+Shift+V` | Toggle sidebar (Files / Semantic) |
| `Ctrl+B`       | Toggle sidebar                    |
| `Ctrl+W`       | Close tab                         |
| `Ctrl+\`       | Toggle split view                 |
| `Esc`          | Close modal                       |

## Browser Requirements

- A Chromium browser (Chrome, Edge) supports the full File System Access API and is recommended.
- Firefox and Safari can only read a folder through drag and drop.
- Browser AI mode needs a browser with WebGPU.

## Contributing and security

Contributions are welcome, and [CONTRIBUTING.md](CONTRIBUTING.md) explains how. Report a vulnerability privately as [SECURITY.md](SECURITY.md) describes, not in a public issue. Bridge releases are listed in [bridge/CHANGELOG.md](bridge/CHANGELOG.md).

## License

[MIT](LICENSE) © 2026 Yoonsoo Chang
