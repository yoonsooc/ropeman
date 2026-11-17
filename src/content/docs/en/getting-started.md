---
title: Getting Started
description: Visualize any codebase as an AI-generated architecture diagram in 30 seconds
category: intro
order: 1
---

## What is Ropeman

Ropeman is a **browser-based code visualization tool** that turns any codebase into an **AI-powered semantic architecture diagram**. Instead of showing a raw file tree, it surfaces the _roles and relationships_ that actually define your project's architecture.

Drop a folder, get a diagram. Click any region to drill down — the AI recursively analyzes sub-structures on demand. Your source code never leaves the browser: WASM parses the AST locally, and only a compact **code structure summary** (skeleton) is sent to the selected AI track.

Try it now at [ropeman.dev](https://ropeman.dev) — no signup required.

## Use it from your coding agent

The main way to use Ropeman is from a coding agent through the Ropeman skill. You need Node 22 or later. First, install the `ropeman` command:

```bash
npm install -g @ropeman/bridge@0.5.0
```

Then save the skill in the folder your agent loads skills from. Run the line for your agent:

```bash
# Claude Code (tested)
curl --create-dirs -fsSLo ~/.claude/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.5.0/skill/ropeman/SKILL.md
# Codex (not tested)
curl --create-dirs -fsSLo ~/.agents/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.5.0/skill/ropeman/SKILL.md
# Gemini CLI (not tested)
curl --create-dirs -fsSLo ~/.gemini/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.5.0/skill/ropeman/SKILL.md
# Cursor (not tested)
curl --create-dirs -fsSLo ~/.cursor/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.5.0/skill/ropeman/SKILL.md
```

The skill is tested with Claude Code. Codex, Gemini CLI and Cursor load skills from these folders according to their own documentation, but Ropeman has not been tested with them yet. For another agent, save the file as `ropeman/SKILL.md` in the folder that agent loads skills from. If your agent has no skill support, paste the text of `SKILL.md` into the conversation. The setup on the [home page](/) shows the same commands.

When both are installed, ask your agent to "map this repo". It builds the map, names the top two levels, checks the names against the code, starts `ropeman serve` and gives you a `http://127.0.0.1:9800/bridge#token=…` address to open.

### Use a graph file you already have

By default `ropeman map` reads the repository with Ropeman's own extraction. If another tool already wrote a graph file for the repository, you can build the map from that file instead. This option comes with the next release of `@ropeman/bridge`. Version 0.5.0 does not have it.

`ropeman map` looks for graph files at `graphify-out/graph.json` and `.graphicle/graph.json`. When it finds one, it does not switch to it on its own:

- In a terminal, it asks which input to use. Ropeman's own extraction is the first choice and the default.
- When your agent runs it, it writes no map and lists the choices. The agent shows them to you and passes your answer with `--input`.

Each graph file in the list shows its size, when it changed, the tool that wrote it, and how many of the code files on disk it covers. The map shows only the files the graph holds, so a graph that covers less than 90% comes with a warning. To choose yourself, pass the file or `ropeman`:

```bash
ropeman map --root . --out .ropeman --input graphify-out/graph.json
ropeman map --root . --out .ropeman --input ropeman
```

Ropeman remembers the choice in the `--out` folder, so later runs use the same input. Ropeman never installs or runs Graphify or any other tool. It reads only Graphify's `graph.json` format and refuses other formats with the reason. [ADR-28](https://github.com/yoonsooc/ropeman/blob/main/docs/adr/0028-graph-file-as-chosen-input.md) explains the choice.

The quickstart below is the in-browser path, which needs no install.

## 30-Second Quickstart

The fastest path to your first diagram is **Demo mode**. No API key, no installation.

1. Open [ropeman.dev](https://ropeman.dev) in a Chromium-based browser (Chrome or Edge recommended).
2. Click **Open Folder** (or drag-and-drop a project directory onto the landing area).
3. Pick any small project — a personal repo, an open-source library, anything with up to 2,000 files.
4. Ropeman parses each file in your browser. You'll see files light up in the sidebar as they're indexed.
5. Click **Analyze with AI**, choose **Demo** in the modal, and let the AI generate your first semantic diagram.
6. **Double-click** any node to drill down into its sub-structure. The AI re-analyzes that region on demand.

That's it. The resulting diagram is cached in your browser, so reopening the same folder is instant.

## Analyze a GitHub Repository

Don't have a local project handy? You can analyze any public GitHub repository directly from the landing page.

1. Paste a GitHub repository URL into the URL input field (e.g., `https://github.com/owner/repo`).
2. Click **Load** — Ropeman fetches the repository's file structure and parses it automatically.
3. From here, everything works the same as a local folder: AI analysis, drill-down, and code viewer are all available.

Only public repositories are supported. Private repositories cannot be analyzed.

## Tips for Large Projects

To exclude extra directories from analysis (e.g., monorepo build outputs), go to Settings → **Additional Excluded Directories** and enter one directory name per line (such as `target`, `third_party`, or `generated`). Your custom patterns are merged with the built-in skip list (`node_modules`, `.git`, etc.). Changes save automatically on blur and apply to the next project load.

Need more room in the file explorer? Drag the **right edge of the sidebar** to resize. The width is persisted per browser.

## Analysis Progress and Cancellation

Analysis continues across in-app route navigation. The **progress pill** at the bottom-right is shown on every route; click the red **Cancel** button to stop. A confirmation dialog appears once (with a "Don't ask again" option) to prevent accidental cancels.

If you trigger drill-downs on multiple regions in parallel, each request gets its own pill. Beyond three concurrent analyses, pills collapse into a single **"N analyses running"** group badge — use the chevron to expand the list and cancel individual requests. When the tab is inactive, a **Browser Notification** fires on completion (if permission was granted).

## Supported Languages

Ropeman parses **14 languages** out of the box, all entirely in your browser: Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, and Scala.

Mixed-language projects are fully supported — the AI reasons across language boundaries when inferring architecture.

## Browser Requirements

- **Chrome / Edge (recommended)** — full [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) support for folder picking and live file reads.
- **Firefox / Safari** — drag-and-drop folder upload works, but the picker dialog is unavailable.
- **WebGPU mode** additionally requires a WebGPU-capable browser and GPU.

## Project Limits

To keep everything snappy in the browser, Ropeman enforces two soft limits:

- **MAX_FILES** — 2,000 files per project
- **MAX_FILE_SIZE** — 500 KB per individual file

Large monorepos should be opened one package at a time. You can also tune the code structure summary size in **Settings** (default 250 KB).

## Next Steps

- [AI Modes](/docs/en/ai-modes) — pick the right track for your workflow (Demo, BYOK, WebGPU).
- [Bridge Setup](/docs/en/bridge-setup) — start `ropeman serve` yourself and open a map of a folder on your machine.
- [Security](/docs/en/security) — exactly what leaves your machine and what doesn't.
- [Keyboard Shortcuts](/docs/en/keyboard-shortcuts) — navigate the canvas like a pro.
- [FAQ](/docs/en/faq) — answers to the questions most new users ask.
