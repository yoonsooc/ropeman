# Ropeman

> Semantic code architecture visualizer -- Local-First, AI-powered

**Live**: [https://ropeman.dev](https://ropeman.dev)

[한국어](./README-KO.md)

## Overview

Ropeman analyzes any codebase in the browser and generates **AI-driven semantic architecture diagrams**. Instead of showing raw file trees, it surfaces the _roles and relationships_ that define your project's architecture.

Drop a folder, get an architecture diagram. Click any region to drill down further -- the AI recursively analyzes sub-structures on demand.

### Key Value Propositions

- **Semantic-First** -- the main canvas shows role-based diagrams, not file trees
- **Recursive Drill-down** -- click a region to get deeper AI analysis
- **100% Local-First** -- source code never leaves the browser; only skeleton metadata is sent to AI (symbols, signatures and imports; for Markdown, frontmatter name and description, headings and file links)
- **Zero Friction** -- URL, drop folder, diagram. No install, no signup required for demo mode

## Features

- **AI Semantic Analysis** -- LLM-based architecture diagram generation
- **Recursive Drill-down** -- click any node to expand its internal structure
- **Multi-Track AI** -- four modes to suit different needs (see below)
- **Local-First** -- WASM-based AST parsing in-browser; only code skeletons reach the AI
- **Polyglot** -- 14 languages (Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, Scala)
- **Code Viewer** -- syntax-highlighted source with split view
- **Code Snippet Analysis** -- paste and analyze code snippets directly
- **Semantic Caching** -- Cache API persistence across sessions
- **Search** -- full-text and semantic search via Orama

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
git clone https://github.com/nkinba/ropeman.git
cd ropeman
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in a Chromium-based browser (Chrome / Edge recommended for File System Access API support).

### Scripts

| Command                     | Description                    |
| --------------------------- | ------------------------------ |
| `npm run dev`               | Start dev server               |
| `npm run build`             | Production build               |
| `npm run test:unit`         | Run unit tests (Vitest)        |
| `npm run test:e2e`          | Run E2E tests (Playwright)     |
| `npm run lint`              | Lint with ESLint               |
| `npm run format`            | Format with Prettier           |
| `npm run deploy`            | Deploy Pages app to Cloudflare |
| `npm run deploy:edge:demo`  | Deploy edge demo Worker        |
| `npm run deploy:edge:proxy` | Deploy edge proxy Worker       |

## AI Modes

Ropeman supports four AI tracks:

1. **Demo** -- free, no setup required. Uses an edge proxy with rate limiting. Great for trying out the tool.
2. **API Key (BYOK)** -- bring your own Google Gemini, Anthropic, or OpenAI key. Keys stay in the browser (localStorage), requests go through a secure edge proxy.
3. **Local Bridge** -- connect to a locally running AI (Claude Code, Gemini CLI, etc.) via a bridge server. Source code stays entirely on your machine.
4. **Browser AI** -- WebGPU-powered in-browser inference via web-llm. Fully offline, experimental.

## Architecture

```
src/lib/
  stores/       # Svelte 5 rune singletons (module-level)
  services/     # Pure functions, AI adapter, caching
  components/   # Svelte 5 components ($props pattern)
  workers/      # Web Workers (AST parser, web-llm)
  types/        # TypeScript interfaces
  utils/        # Utilities (language detection, etc.)

edge-proxy/
  src/          # Cloudflare Workers (demo, proxy, shared)
```

### Data Flow

1. User drops a folder (File System Access API)
2. Parser Worker (web-tree-sitter WASM) extracts AST skeletons per file
3. AI adapter sends skeletons to the selected AI track
4. Response is parsed into semantic nodes/edges and rendered via SvelteFlow
5. Results are cached (Cache API) for instant reload

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

- Chromium-based browser recommended (Chrome, Edge) for full File System Access API support
- Firefox / Safari: limited to drag-and-drop folder upload
- WebGPU AI mode requires a WebGPU-capable browser

## License

[MIT](LICENSE) © 2026 Yoonsoo Chang
