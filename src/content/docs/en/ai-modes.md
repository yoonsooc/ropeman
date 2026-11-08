---
title: AI Modes
description: Compare Demo, API Key (BYOK), Bridge, and WebGPU — and pick the right track
category: guides
order: 2
---

Ropeman offers **four AI tracks** so you can pick the trade-off between convenience, cost, and privacy that suits your workflow. All four modes produce the same kind of semantic diagram — what changes is _where_ the inference happens.

## The Four Tracks

### 1. Demo

The zero-friction default. Great for trying Ropeman on a small project without any setup.

- **Requirements**: None. Just open [ropeman.dev](https://ropeman.dev).
- **Data flow**: Browser parses AST locally → code structure summary is sent through Ropeman's **edge proxy** → forwarded to a hosted AI provider → diagram returned.
- **Characteristics**: Free, rate-limited, project-size capped. Shared quota across all users.
- **Free tier notice**: Demo runs on the free tier of the Google Gemini API, where Google may use prompts and responses to improve its products. For code you would not share, use API Key, Bridge, or WebGPU mode.
- **Recommended for**: First-time users, quick demos, evaluating the tool on a small repo.

### 2. API Key (BYOK)

Bring Your Own Key. You plug in a **Google Gemini**, **Anthropic Claude**, or **OpenAI** API key and pay for your own inference.

- **Requirements**: A valid API key from one of the supported providers.
- **Data flow**: Key is stored only in your browser's `localStorage` → code structure summary is sent through Ropeman's secure edge proxy (which forwards the call but never stores the key) → provider returns the diagram.
- **Characteristics**: No rate limits beyond your provider's own quota. You control the model (e.g. Gemini 2.5 Pro, Claude Sonnet 4, GPT-4o).
- **Recommended for**: Regular users, larger projects, when you want a specific model.

### 3. Bridge (Local CLI)

Connects Ropeman to a **locally installed AI CLI** such as Claude Code or Gemini CLI via a small bridge server running on `localhost`.

- **Requirements**: Claude Code or Gemini CLI installed, plus the Ropeman bridge server running. See [Bridge Setup](/docs/en/bridge-setup).
- **Data flow**: Browser → `http://localhost` bridge → local CLI → provider API. Ropeman's servers are **never** touched.
- **Characteristics**: Uses your CLI's existing authentication — no API key to paste. Your code structure summary is sent only to the provider your CLI is configured for.
- **Recommended for**: Users who already pay for Claude Code or Gemini CLI subscriptions, teams with strict data-routing policies.

### 4. WebGPU (Experimental)

Runs a small LLM **entirely inside your browser** using a built-in WebGPU runtime. No network calls during inference.

- **Requirements**: A WebGPU-capable browser (Chrome 113+, Edge 113+) and a reasonably modern GPU. First run downloads the model weights (~1–4 GB) and caches them.
- **Data flow**: **100% offline.** Everything — parsing, summarization, inference — stays on the device.
- **Characteristics**: Slowest and most experimental track. Smaller input size limit (roughly 12 KB of code structure summary). Diagram quality varies with the chosen model.
- **Recommended for**: Maximum-privacy scenarios (regulated industries, air-gapped demos), experimenting with local LLMs.

## Code Structure Summary Size and Analysis Quality

Across every track, Ropeman sends only a **code structure summary (skeleton)** — never your raw source. The size of that summary directly influences both analysis quality and how long each request takes, and the practical limit also depends on the model you pick.

- **Bigger is more accurate; smaller is faster.** A larger summary lets the model see more functions, classes, and relationships at once, which usually produces a sharper diagram. The trade-off is more tokens, longer responses, and (for paid tracks) higher cost.
- **Per-model limits vary.** Even within the same track, your selected model's context window and throughput determine how much summary it can ingest comfortably. WebGPU's small in-browser models in particular accept far less input than cloud models.
- **Default and tuning.** The default cap is **250 KB**, adjustable in **Settings → Code Summary Size Limit**. Lower it if you hit token-limit errors from the provider; raise it when you want more thorough analysis. WebGPU is most stable around **~12 KB**.

The recommended workflow: start at the default, and only nudge the limit up or down if the diagram quality or response time isn't matching your needs.

## Mode Selection Guide

| If you want...                                  | Pick        |
| ----------------------------------------------- | ----------- |
| To try Ropeman right now, no setup              | **Demo**    |
| Full control over model and quota               | **API Key** |
| To reuse your existing Claude Code / Gemini CLI | **Bridge**  |
| Absolutely nothing to leave your device         | **WebGPU**  |

## Switching Modes

You can switch tracks at any time from the **AI Connection** card in Settings, or from the **Analyze** modal when starting a new analysis. Each track has its own cached results — switching doesn't discard anything.

For a deeper look at what data actually moves between these components, see [Security](/docs/en/security).
