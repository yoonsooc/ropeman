---
title: FAQ
description: Answers to the most common questions about Ropeman
category: reference
order: 4
---

## Privacy & Data

### Is my original source code ever sent to an external server?

No. Ropeman sends the AI a code summary (file paths, symbol names and imports), not the files themselves. Where the summary goes depends on the AI mode.

- **WebGPU mode**: the model runs on your device, and nothing leaves it.
- **Demo and API Key modes**: the summary goes to the AI provider. Demo requests and Anthropic or OpenAI key requests pass through Ropeman's proxy, which does not store them. Gemini key requests go straight to Google.
- **Local Bridge mode**: your local CLI sends the summary to its provider. Ropeman's servers are not involved.

For a full breakdown, see [Security](/docs/en/security).

### Are my API keys stored securely?

Ropeman's servers don't store API keys. The key stays in this browser's local storage.

- **API Key mode**: the key goes out with each AI request. Gemini requests go straight to Google. Anthropic and OpenAI requests pass through Ropeman's proxy, which does not store the key.
- **Local Bridge mode**: you don't enter a key. The CLI uses its own login. The bridge asks for its own token, which stays on your machine and in this browser.
- **WebGPU mode**: no key is needed.

You can delete stored keys anytime with **Settings → Reset**.

### What exactly is in the "code structure summary"?

File paths, the names of functions, classes and methods, and imports. For Markdown files it holds the frontmatter name and description, headings and links. Function bodies, comments, string literals, variable values, and type and interface declarations are left out. The summary is capped at 250 KB by default, adjustable in **Settings → Code Summary Size Limit**.

## Languages & Projects

### What programming languages are supported?

Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, and Scala.

### Are there project size limits?

Up to **2,000 files** and **500 KB per individual file**. For large projects, adjust the code structure summary size limit in **Settings**, or open one subdirectory at a time.

### Can Ropeman handle mixed-language projects?

Yes. The in-browser parser handles each file by its extension, and the AI reasons across language boundaries when generating the diagram. A typical Python backend + TypeScript frontend monorepo works fine.

### What happens if a file fails to parse?

Unparseable files are skipped silently and do not block the rest of the project. You can see per-file status in the file explorer. Parse errors are usually caused by unsupported language dialects or files exceeding the 500 KB cap.

## Usage & Features

### How do I drill down into a diagram?

**Double-click** any node on the canvas. Ropeman sends the sub-region's code structure summary back to the AI and renders a fresh diagram for that scope. Use the **breadcrumb** at the top to navigate back up.

### Can I use Ropeman commercially?

Yes. You can analyze your own code with Ropeman, personal or commercial. The tool itself is provided as-is from [ropeman.dev](https://ropeman.dev). If you use **Demo** mode, remember the shared quota is for evaluation; switch to **API Key** or **Local Bridge** for sustained professional use.

### Does Ropeman work offline?

Partially. Once the page is loaded, **WebGPU mode** is fully offline. Other modes require a network connection for the AI call. If you need to work air-gapped, use WebGPU and pre-download the model weights.

### What happens to my diagrams when I close the tab?

Analysis results are cached in your browser and restored on the next visit. They persist until you clear site data or click **Clear Cache** in Settings.

## Compatibility

### Which browsers are supported?

**Chrome** and **Edge** (Chromium-based) are fully supported, including the File System Access API. **Firefox** and **Safari** work via drag-and-drop folder upload but cannot use the folder picker dialog. **WebGPU mode** additionally requires Chrome 113+ or Edge 113+ with a compatible GPU.

### Why does the folder picker not show up in Firefox?

Firefox does not yet implement `showDirectoryPicker()`. Use drag-and-drop instead — drop a folder anywhere on the landing page and Ropeman will read it recursively.

### I use Safari. What should I expect?

Drag-and-drop folder upload works. File System Access API features (live re-reads) and WebGPU mode are unavailable. Demo, API Key, and Bridge modes otherwise function normally.

### Can I analyze a GitHub repository by URL?

Yes. Paste a public GitHub repository URL into the input field on the landing page and click **Load**. Ropeman fetches the file structure and analyzes it just like a local folder. Private repositories are not supported.

### Can I share my analysis results?

Yes. After AI analysis completes, click the **Share** button in the header to generate a public link. Anyone with the link can view the analysis for 14 days.

### Can I exclude specific directories from analysis?

Yes. Go to Settings → **Additional Excluded Directories** and enter one directory name per line. Your custom patterns are merged with the built-in skip list (node_modules, .git, tests, etc.). This is useful for large monorepos or generated-code directories like Rust's `target`, `third_party`, or `generated`. Changes persist per browser and apply from the next project load.

### Can I cancel an ongoing analysis?

Yes. The progress pill at the bottom-right has a red **Cancel** button. A one-time confirmation dialog appears (with a "Don't ask again" option). Cancellation works across all AI modes — Demo, API Key, Bridge, and WebGPU. Analysis also continues seamlessly across in-app route navigation; the pill remains visible on every page. Closing the tab or reloading the page does terminate the analysis — the browser will warn you in that case.

### Can I run multiple analyses in parallel?

Yes. Double-click different nodes in the diagram to drill down into multiple regions concurrently. Each request gets its own pill with an individual Cancel button. Beyond three concurrent analyses, pills collapse into a single **"N analyses running"** group badge; click the chevron to expand the list and cancel individual requests. A **Browser Notification** fires on completion when the tab is inactive (if permission was granted).

Still stuck? See [Troubleshooting](/docs/en/troubleshooting).
