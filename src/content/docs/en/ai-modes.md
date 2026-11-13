---
title: AI Modes
description: Compare Demo, API Key (BYOK) and WebGPU, and pick the right track
category: guides
order: 2
---

Ropeman offers **three AI tracks** so you can pick the trade-off between convenience, cost, and privacy that suits your workflow. All three modes produce the same kind of semantic diagram. What changes is _where_ the inference happens.

## The Three Tracks

### 1. Demo

The zero-friction default. Great for trying Ropeman on a small project without any setup.

- **Requirements**: None. Just open [ropeman.dev](https://ropeman.dev).
- **Data flow**: The browser parses the code locally and sends the code summary to Ropeman's demo Worker, which forwards it to the Google Gemini API and returns the diagram.
- **Characteristics**: Free, rate-limited, project-size capped. Shared quota across all users.
- **Free tier notice**: Demo runs on the free tier of the Google Gemini API, where Google may use prompts and responses to improve its products. For code you would not share, use API Key or WebGPU mode.
- **Recommended for**: First-time users, quick demos, evaluating the tool on a small repo.

### 2. API Key (BYOK)

Bring Your Own Key. You plug in a **Google Gemini**, **Anthropic Claude**, or **OpenAI** API key and pay for your own inference.

- **Requirements**: A valid API key from one of the supported providers.
- **Data flow**: The key is stored only in your browser's `localStorage`. With a Gemini key, the browser sends the code summary straight to Google. With an Anthropic or OpenAI key, the browser sends the summary and the key to Ropeman's proxy because of browser restrictions, and the proxy forwards the call to the provider without storing the key.
- **Characteristics**: No rate limits beyond your provider's own quota. You control the model (e.g. Gemini 2.5 Pro, Claude Sonnet 4, GPT-4o).
- **Recommended for**: Regular users, larger projects, when you want a specific model.

### 3. WebGPU (Experimental)

Runs a small LLM **entirely inside your browser** using a built-in WebGPU runtime. No network calls during inference.

- **Requirements**: A WebGPU-capable browser (Chrome 113+, Edge 113+) and a reasonably modern GPU. The first run downloads the model weights and caches them: about 400 MB to 4.3 GB depending on the model, 900 MB for the default.
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

| If you want...                          | Pick        |
| --------------------------------------- | ----------- |
| To try Ropeman right now, no setup      | **Demo**    |
| Full control over model and quota       | **API Key** |
| Absolutely nothing to leave your device | **WebGPU**  |

To map a folder on your machine, use Bridge mode at [ropeman.dev/bridge](https://ropeman.dev/bridge). Your coding agent names the top levels. A headless `claude` worker names the parts of each folder you open. Without a worker CLI, your agent names them on your next message. serve runs `gemini` only with `--cli gemini`. See [Bridge Setup](/docs/en/bridge-setup).

## Switching Modes

You can switch tracks at any time. Click **Analyze** in the header, the AI badge next to it, or **Settings → AI Connection**; each opens the **AI Architecture Analysis** dialog with one card per mode. Each track and model has its own cached results, so switching doesn't discard anything.

For a deeper look at what data actually moves between these components, see [Security](/docs/en/security).
