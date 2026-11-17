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
npm install -g @ropeman/bridge@0.6.0
```

Then save the skill in the folder your agent loads skills from. Run the line for your agent:

```bash
# Claude Code (tested)
curl --create-dirs -fsSLo ~/.claude/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.6.0/skill/ropeman/SKILL.md
# Codex (not tested)
curl --create-dirs -fsSLo ~/.agents/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.6.0/skill/ropeman/SKILL.md
# Gemini CLI (not tested)
curl --create-dirs -fsSLo ~/.gemini/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.6.0/skill/ropeman/SKILL.md
# Cursor (not tested)
curl --create-dirs -fsSLo ~/.cursor/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.6.0/skill/ropeman/SKILL.md
```

The skill is tested with Claude Code. Codex, Gemini CLI and Cursor load skills from these folders according to their own documentation, but Ropeman has not been tested with them yet. For another agent, save the file as `ropeman/SKILL.md` in the folder that agent loads skills from. If your agent has no skill support, paste the text of `SKILL.md` into the conversation. The setup on the [home page](/) shows the same commands.

When both are installed, ask your agent to "map this repo". It builds the map, names the top two levels, checks the names against the code, starts `ropeman serve` and gives you a `http://127.0.0.1:9800/bridge#token=…` address to open.

A folder that holds only one subfolder is skipped: Ropeman shows the chain as one card labelled with its path, so each drill-down opens a level with something to choose.

### Use a graph file you already have

By default `ropeman map` reads the repository with Ropeman's own extraction. If another tool already wrote a graph file for the repository, you can build the map from that file instead. This option needs `@ropeman/bridge` 0.6.0 or later.

`ropeman map` looks for graph files at `graphify-out/graph.json` and `.graphicle/graph.json`. When it finds one, it does not switch to it on its own:

- In a terminal, it asks which input to use. Ropeman's own extraction is the first choice and the default.
- When your agent runs it, it writes no map and lists the choices. The agent shows them to you and passes your answer with `--input`.

Each graph file in the list shows its size, when it changed, the tool that wrote it, and how many of the code files on disk it covers. The map shows only the files the graph holds, so a graph that covers less than 90% comes with a warning. To choose yourself, pass the file or `ropeman`:

```bash
ropeman map --root . --out .ropeman --input graphify-out/graph.json
ropeman map --root . --out .ropeman --input ropeman
```

Ropeman remembers the choice in the `--out` folder, so later runs use the same input. Ropeman never installs or runs Graphify or any other tool. It reads only Graphify's `graph.json` format and refuses other formats with the reason. [ADR-28](https://github.com/yoonsooc/ropeman/blob/main/docs/adr/0028-graph-file-as-chosen-input.md) explains the choice.

### The work folder

The agent and Ropeman share one folder, the work folder. By default it is `.ropeman` in the repository. The agent picks a folder outside the repository when you do not want the repository changed. `ropeman map` writes a `.gitignore` into a work folder inside the repository, so git does not commit it.

Each file in the work folder has one writer. The diagram shows who writes each file and what reads it next.

<figure class="work-folder-diagram">
<svg viewBox="0 0 430 562" role="img" aria-labelledby="wf-title wf-desc">
<title id="wf-title">Who writes each file in the work folder</title>
<desc id="wf-desc">ropeman map writes ropeman.json, work.json and input.json. Your agent reads work.json and writes names.json and brief.md, then runs ropeman map again until no problems are left. ropeman serve --detach shows ropeman.json and writes serve.json, serve.lock and serve.log. When you open an unnamed folder, a worker names it with brief.md and writes naming-log.jsonl; without a worker serve writes queue.json. ropeman inbox reads both for your agent next turn and writes inbox-read.json.</desc>
<defs><marker id="wf-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" class="wf-head"/></marker></defs>
<rect class="wf-box" x="10" y="8" width="300" height="66" rx="6"/>
<text class="wf-actor" x="22" y="29">ropeman map</text>
<text class="wf-verb" x="22" y="48">writes</text>
<text class="wf-file" x="72" y="48">ropeman.json · work.json</text>
<text class="wf-verb" x="22" y="66"></text>
<text class="wf-file" x="72" y="66">input.json</text>
<text class="wf-note" x="152" y="66">(once you choose an input)</text>
<path class="wf-arrow" d="M160 74V107" marker-end="url(#wf-head)"/>
<text class="wf-note" x="168" y="95">work.json: parts to name</text>
<rect class="wf-box wf-you" x="10" y="108" width="300" height="66" rx="6"/>
<text class="wf-actor" x="22" y="129">Your agent</text>
<text class="wf-verb" x="22" y="148">reads</text>
<text class="wf-file" x="72" y="148">work.json</text>
<text class="wf-verb" x="22" y="166">writes</text>
<text class="wf-file" x="72" y="166">names.json · brief.md</text>
<path class="wf-arrow" d="M310 148H332V34H311" marker-end="url(#wf-head)"/>
<text class="wf-note" x="338" y="60">names.json:</text>
<text class="wf-note" x="338" y="74">run map again</text>
<text class="wf-note" x="338" y="88">until no</text>
<text class="wf-note" x="338" y="102">problems</text>
<path class="wf-arrow" d="M160 174V207" marker-end="url(#wf-head)"/>
<text class="wf-note" x="168" y="195">no problems left</text>
<rect class="wf-box" x="10" y="208" width="300" height="84" rx="6"/>
<text class="wf-actor" x="22" y="229">ropeman serve --detach</text>
<text class="wf-verb" x="22" y="248">shows</text>
<text class="wf-file" x="72" y="248">ropeman.json</text>
<text class="wf-verb" x="22" y="266">writes</text>
<text class="wf-file" x="72" y="266">serve.json · serve.lock</text>
<text class="wf-verb" x="22" y="284"></text>
<text class="wf-file" x="72" y="284">serve.log</text>
<path class="wf-arrow" d="M160 292V325" marker-end="url(#wf-head)"/>
<text class="wf-note" x="168" y="313">you open an unnamed folder</text>
<rect class="wf-box" x="10" y="326" width="145" height="102" rx="6"/>
<text class="wf-actor" x="22" y="347">Worker</text>
<text class="wf-verb" x="22" y="366"></text>
<text class="wf-file" x="72" y="366">claude -p</text>
<text class="wf-verb" x="22" y="384">reads</text>
<text class="wf-file" x="72" y="384">brief.md</text>
<text class="wf-verb" x="22" y="402">writes</text>
<text class="wf-file" x="72" y="402">naming-log</text>
<text class="wf-verb" x="22" y="420"></text>
<text class="wf-file" x="72" y="420">.jsonl</text>
<rect class="wf-box" x="165" y="326" width="145" height="48" rx="6"/>
<text class="wf-actor" x="177" y="347">No worker</text>
<text class="wf-verb" x="177" y="366">writes</text>
<text class="wf-file" x="227" y="366">queue.json</text>
<path class="wf-arrow" d="M82.5 428V461" marker-end="url(#wf-head)"/>
<path class="wf-arrow" d="M237.5 374V461" marker-end="url(#wf-head)"/>
<rect class="wf-box" x="10" y="462" width="300" height="66" rx="6"/>
<text class="wf-actor" x="22" y="483">ropeman inbox</text>
<text class="wf-verb" x="22" y="502">reads</text>
<text class="wf-file" x="72" y="502">queue.json · naming-log.jsonl</text>
<text class="wf-verb" x="22" y="520">writes</text>
<text class="wf-file" x="72" y="520">inbox-read.json</text>
<path class="wf-arrow" d="M160 528V557" marker-end="url(#wf-head)"/>
<text class="wf-note" x="168" y="549">your agent's next turn</text>
</svg>
</figure>

1. `ropeman map` reads the repository and writes `ropeman.json`, the map. Until a level gets names that pass the checks, its parts keep their folder names. `ropeman map` also writes `work.json`, the list of parts that still need names. Once you choose the input, as in [Use a graph file you already have](#use-a-graph-file-you-already-have), it records the choice in `input.json`.
2. Your agent reads `work.json` and writes `names.json`, which gives each part a label, a description and key symbols. It also writes `brief.md`: what you want to learn, the project's terms, its naming rules and the names of the upper levels.
3. Your agent runs `ropeman map` again. Ropeman applies `names.json`, checks every name against the code, and writes `ropeman.json` and `work.json` again. A level keeps its names only when all of them pass. The agent repeats steps 2 and 3 until `ropeman map` reports no problems.
4. Your agent starts `ropeman serve --detach`. The start holds `serve.lock` while it launches serve in the background and writes serve's output to `serve.log`. serve shows the map from `ropeman.json` and records itself in `serve.json`.
5. When you open a folder that has no names yet, serve asks a headless worker to name its parts: `claude -p`, or Gemini CLI when serve runs with `--cli gemini`. The worker gets the first 4,000 bytes of `brief.md` as context. serve writes each result to `naming-log.jsonl`. Without a worker, serve adds the folder to `queue.json` for your agent.
6. When you send your next message, the agent runs `ropeman inbox` first. It returns the queued folders and the log lines added since the last check, and records how far it read in `inbox-read.json`. The agent names the queued folders with steps 2 and 3.

| File               | Written by                                 | Read by                                  |
| ------------------ | ------------------------------------------ | ---------------------------------------- |
| `ropeman.json`     | `ropeman map`                              | serve, `ropeman verify`, `ropeman inbox` |
| `work.json`        | `ropeman map`                              | your agent                               |
| `input.json`       | `ropeman map`, once you choose an input    | `ropeman map`, `ropeman verify`, serve   |
| `names.json`       | your agent                                 | `ropeman map`                            |
| `brief.md`         | your agent                                 | serve's workers                          |
| `naming-log.jsonl` | serve                                      | `ropeman inbox`                          |
| `queue.json`       | serve                                      | `ropeman map`, serve, `ropeman inbox`    |
| `inbox-read.json`  | `ropeman inbox`                            | `ropeman inbox`                          |
| `serve.json`       | serve (`ropeman stop` removes a stale one) | serve, `ropeman stop`                    |
| `serve.lock`       | `ropeman serve --detach`                   | `ropeman serve --detach`                 |
| `serve.log`        | `ropeman serve --detach`                   | you, when serve does not start           |

What you can change by hand:

- To change a name, ask your agent. It edits `names.json` and runs `ropeman map`. You can also edit `names.json` yourself and run `ropeman map --root <repo> --out <work folder>`. A name stays only when every name of its level passes the checks.
- To steer the worker names, edit `brief.md`, for example to add a naming rule. Workers read it each time they name a folder, so the change applies to folders you open next.
- To use another input, run `ropeman map` with another `--input`. Do not edit `input.json`.
- Do not edit the other files. `ropeman map` writes `ropeman.json` and `work.json` again on every run, and serve and `ropeman inbox` keep their own records.
- To delete the work folder, run `ropeman stop --out <work folder>` first, so that serve does not keep running on it.

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
