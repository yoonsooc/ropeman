---
title: Security & Privacy
description: Your source code never leaves the browser — here is exactly what is transmitted
category: guides
order: 3
---

## The Core Promise

> **Your original source code is never transmitted to any server — under any circumstances.**

Ropeman is **local-first** by design. All file reading and parsing happens in your browser. For analysis, the only thing that travels over the network is a compact **code summary**: file paths, the names of functions, classes and methods, and imports (for Markdown files, the frontmatter name and description, headings and links). Function bodies, comments, string literals and variable values are left out.

## What Actually Leaves the Browser

When you start an analysis, this is the pipeline:

1. **File read (local)** — Files are read directly through the browser's File System Access API. Nothing is uploaded.
2. **AST parsing (local)** — An in-browser parser builds an abstract syntax tree entirely on your machine. There is no upload step.
3. **Summary extraction (local)** — The parser output is reduced to the code summary described above. The summary is capped at 250 KB by default, adjustable in **Settings → Code Summary Size Limit**.
4. **AI inference (varies by mode)** — Only this step involves the network, and only the summary is sent.
5. **Diagram render (local)** — The AI response is parsed into nodes and edges and rendered in your browser.

## Data Flow by Mode

| Mode                            | Summary goes to                                                     | Routes through Ropeman? |
| ------------------------------- | ------------------------------------------------------------------- | ----------------------- |
| **Demo**                        | Ropeman demo Worker, then the Google Gemini API                     | Yes                     |
| **API Key** (Gemini)            | Google Gemini API, straight from your browser                       | No                      |
| **API Key** (Anthropic, OpenAI) | Ropeman proxy Worker, then Cloudflare AI Gateway, then the provider | Yes                     |
| **WebGPU**                      | Nowhere. Inference runs in the browser                              | No                      |

- **Demo** requests go to Ropeman's demo Worker, which calls the Gemini free tier with Ropeman's own key. It counts requests per IP address in memory to enforce the rate limit and does not store the summary or the response.
- **API Key** requests with a Gemini key go from your browser to Google, with the key in the request URL. Because of browser restrictions, Anthropic and OpenAI requests go to Ropeman's proxy Worker, which passes them through Cloudflare AI Gateway to the provider. The proxy does not store the summary, the response or your key. When the provider returns an error, the proxy logs that error response.
- **WebGPU** mode needs the network only to download the model. After that, analysis runs offline.

Bridge mode at [ropeman.dev/bridge](https://ropeman.dev/bridge) is separate from these modes. In Bridge mode, `ropeman serve` on your machine sends your own Claude Code or Gemini CLI the file paths, declared symbol names, and file and import counts of the folder you open. It never sends file contents. The CLI calls its provider with its own login, and Ropeman's servers are not on that path. See [Bridge Setup](/docs/en/bridge-setup).

## API Key Handling

When you use **API Key (BYOK)** mode:

- Keys are stored only in this browser's local storage, one per provider.
- Ropeman's servers do not store keys.
- A Gemini key goes from your browser straight to Google and never reaches Ropeman's servers.
- An Anthropic or OpenAI key travels with each request to Ropeman's proxy, which puts it in the provider's auth header for that one request and keeps nothing.
- You can wipe all keys at any time with **Settings → Reset**.

For the strictest setup, use **WebGPU**, which calls no provider.

## What Is Cached Locally

Ropeman caches three kinds of data in your browser so that reopening a project is instant:

- **Semantic analysis results** — restored automatically on the next visit so you don't pay for re-analysis.
- **Search and chat index** — built on first analysis, used to answer questions about the project.
- **WebGPU model weights** — only when you've used WebGPU mode.

All caches live under your browser's origin. Clearing site data removes them, and you can wipe just the analysis cache from **Settings → Clear Cache**.

## Privacy Principles

- **No account, no per-project telemetry.** Ropeman tracks only aggregate page-view statistics (cookieless, no fingerprinting). It does not record which projects you analyze.
- **No server-side storage of summaries or diagrams, unless you share.** The demo and proxy Workers do not store request bodies. What remains is Cloudflare's request log for each Worker and any error response a provider returned. When you create a share link, Ropeman stores the diagram, the project name and the file paths for 14 days so the link works.
- **Auditable.** Ropeman is open source — the parsing pipeline, summary extractor, and edge proxy are all reviewable.

If maximum privacy matters to you, start with [WebGPU mode](/docs/en/ai-modes).
