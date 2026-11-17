---
title: How Ropeman Differs
description: What Ropeman does differently from other code-map tools, with the file in the repository that backs each point
category: intro
order: 1.5
---

Code-map tools fall into a few kinds: viewers that draw a repository as one large graph, wikis that a model writes about the code, and memory servers that give an agent a store of code facts. Ropeman draws a map one folder level at a time, from facts a parser extracted, with names that a verifier checked. Each section below says what Ropeman does and links to the code or the decision record in the repository that shows it.

## 1. What a model sees

Extraction uses no model. Ropeman walks the folder, and tree-sitter parsers read the symbols, imports and calls of each file, in a Web Worker in the browser or in Node for the `ropeman` command. Each model prompt is built from that result, and none carries function bodies or comments.

- In the browser app, the code summary holds file paths, symbol names and kinds, and imports. For Markdown it also holds headings and frontmatter values, and for a Dockerfile its commands ([`toWireFile` in `src/lib/services/skeletonExtractor.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/services/skeletonExtractor.ts), [`src/lib/types/skeleton.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/types/skeleton.ts)).
- With the skill, `work.json` and each worker prompt leave those out and give every part its file count, sample paths and declared symbol names, and count the imports between parts ([`summarizePart` in `bridge/src/naming.ts`](https://github.com/yoonsooc/ropeman/blob/main/bridge/src/naming.ts)). The worker prompt tells the model that it sees no file contents.

The skill tells your agent to name parts from `work.json` and to open a source file only when a part's role is unclear from its paths and symbols ([`skill/ropeman/SKILL.md`](https://github.com/yoonsooc/ropeman/blob/main/skill/ropeman/SKILL.md)). Ropeman never reads a real `.env` file. Extraction gives it no language, so no parser opens it ([`src/lib/utils/languageDetector.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/utils/languageDetector.ts)). A link to it is not followed ([`packages/core/src/walk.ts`](https://github.com/yoonsooc/ropeman/blob/main/packages/core/src/walk.ts)), serve refuses to open it ([`bridge/src/fileRead.ts`](https://github.com/yoonsooc/ropeman/blob/main/bridge/src/fileRead.ts)), and worker prompts leave its path out. Template files such as `.env.example` are read like other files.

## 2. Names are checked against the code

The agent or a worker writes a label, a one-sentence description and up to six key symbols for each part. Ropeman keeps a name only after the verifier passes it ([`src/lib/services/mapVerifier.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/services/mapVerifier.ts)). The verifier checks that each file of a level is in exactly one part, that each key symbol is declared in a file of its part, that each path is a file the extractor found, and that each piece of evidence for a link names a relation in the code, with the same file, line, kind and target. It reports every violation with a code and the field it is in. The codes are listed in [`src/lib/types/mapVerification.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/types/mapVerification.ts).

A level whose names fail keeps its folder names, so the `ropeman.json` that `ropeman map` writes always passes. `ropeman verify --root <repo> --map <file>` runs the same checks on any map.

Each link carries its provenance. EXTRACTED means the parser decided the relation. INFERRED means a model proposed it or the relation matched by name only. In the maps the skill builds, every link between parts comes from relations the code decides ([`fileRelations` in `src/lib/services/codeRelations.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/services/codeRelations.ts)). In the browser app, where the model also proposes links, the viewer draws INFERRED links dashed ([`src/lib/services/semanticGraphBuilder.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/services/semanticGraphBuilder.ts)).

## 3. One level at a time, and every file is placed

A whole-graph viewer draws every file at once and leaves the grouping to the layout. Ropeman builds one level per folder. The parts of a level are its subfolders, each one a part, and the files directly in the folder, which form one more part. A folder that holds one subfolder and no files of its own gets no level. A chain of such folders becomes one node, titled with the path of the chain ([ADR-30](https://github.com/yoonsooc/ropeman/blob/main/docs/adr/0030-collapse-single-child-folder-chains.md), `chainEnd` in [`packages/core/src/groupedMap.ts`](https://github.com/yoonsooc/ropeman/blob/main/packages/core/src/groupedMap.ts)).

The map lists each file Ropeman parsed, and each file it tried to parse and skipped, with the reason ([`src/lib/types/coverage.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/types/coverage.ts)). The report of `ropeman map` also counts the files in languages Ropeman does not parse. The verifier refuses a map that leaves a parsed file out of that list, or out of the parts of a level that covers it. Click a folder to open its level, and click a file to read its source.

## 4. Your agent names the map

The skill is one Markdown file that uses shell commands and file writes, so a coding agent that runs shell commands can follow it. Your agent writes the names into `names.json`, and `ropeman map` applies and verifies them. When you open a deeper folder, `ropeman serve` names it with a headless worker CLI: `claude -p` when Claude Code is installed, or Gemini CLI when serve starts with `--cli gemini`. The worker gets the brief your agent wrote and the folder's name from the level above. With no worker CLI, the folder goes on a queue that your agent names on your next message ([ADR-25](https://github.com/yoonsooc/ropeman/blob/main/docs/adr/0025-agent-names-the-map.md)).

On this path Ropeman needs no API key and calls no model provider itself. The worker CLI uses its own login. The browser app is a separate path with its own modes: Demo, your own API key, or a model in the browser ([AI Modes](/docs/en/ai-modes)).

## 5. It runs on your machine

`ropeman serve` listens on `127.0.0.1` only ([`bridge/src/bridge.ts`](https://github.com/yoonsooc/ropeman/blob/main/bridge/src/bridge.ts)). It requires a token and checks the Origin and Host of every connection ([`bridge/src/auth.ts`](https://github.com/yoonsooc/ropeman/blob/main/bridge/src/auth.ts)). With `--local`, serve also hosts the viewer, so the page works when the browser blocks ropeman.dev from reaching your machine. The map, your names and your source stay on your machine and do not pass through Ropeman's servers.

The browser app reads and parses a folder in the browser. A GitHub repository is the exception to "files come from your disk": the browser downloads its files from GitHub ([`src/lib/services/githubLoader.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/services/githubLoader.ts)). In Demo mode and with an Anthropic or OpenAI key, the code summary passes through Ropeman's Workers, and a share link stores the diagram and file paths. [Security & Privacy](/docs/en/security) lists what each mode sends.

## 6. Re-map and keep the names

Extraction gives the same levels for the same code, and node ids come from paths (`dir:<path>`, `files:<path>`). So when you run `ropeman map` again after a change, the entries in `names.json` still match their parts. A level whose parts changed fails the check and shows folder names until it is named again. While serve runs, it watches the folders it walked, extracts again after files change, and tells the open page to reload the map. Names stay on the levels they still pass ([`bridge/src/mapSession.ts`](https://github.com/yoonsooc/ropeman/blob/main/bridge/src/mapSession.ts)).

## 7. It can read a graph file you already have

When the repository has a Graphify `graph.json`, `ropeman map` lists it as a choice next to its own extraction. Ropeman uses the file only when you choose it (`--input`), and records that choice for later runs. It reads the code facts of the graph and leaves out the layer and the clusters that an LLM wrote. The map built from the graph goes through the same verifier. Ropeman never installs or runs Graphify, and the skill tells your agent not to. The only format Ropeman has verified is Graphify's `graph.json`, and it refuses other formats with the reason ([ADR-28](https://github.com/yoonsooc/ropeman/blob/main/docs/adr/0028-graph-file-as-chosen-input.md), [`bridge/src/mapInput.ts`](https://github.com/yoonsooc/ropeman/blob/main/bridge/src/mapInput.ts)). A comparison of the two inputs on one repository is in [the measurement notes](https://github.com/yoonsooc/ropeman/blob/main/docs/measurements/2026-11-13-paseo-graphify-comparison.md) (in Korean).

## 8. One file for people and for agents

`ropeman.json` is a versioned format ([ADR-24](https://github.com/yoonsooc/ropeman/blob/main/docs/adr/0024-ropeman-map-format.md), [`src/lib/types/ropemanMap.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/types/ropemanMap.ts)). The Bridge viewer draws it, [ropeman.dev/open](https://ropeman.dev/open) opens it without an install, and `ropeman verify` checks it. `ropeman map` writes `work.json` next to it, with the parts your agent has left to name. The maps in the [gallery](https://ropeman.dev/explore) were made by running the skill, and each one passed `ropeman verify` before it was published ([`scripts/explore/pipeline.mjs`](https://github.com/yoonsooc/ropeman/blob/main/scripts/explore/pipeline.mjs)).
