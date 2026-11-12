---
title: Troubleshooting
description: Diagnose and fix common Ropeman issues
category: support
order: 7
---

If something isn't working, find the matching symptom below. Each entry follows a **Symptom → Cause → Fix** structure.

## Parse Errors

### Symptom — Some files don't appear in the sidebar after opening a folder

- **Cause 1**: The file exceeds the **500 KB per-file size cap**. Large generated files (bundled JS, minified assets) are silently skipped.
- **Cause 2**: The project exceeds the **2,000 file limit**. Ropeman stops indexing at the cap.
- **Auto-excluded directories**: Ropeman automatically skips common dependency, build, cache, and virtual-environment folders such as `node_modules`, `.git`, `dist`, `build`, and `__pycache__` when reading a project. You do **not** need to clean them up first.
- **Fix**: If you still hit the cap after the auto-exclude, the scope is genuinely too broad. Open a single package of a monorepo, or pick a more specific subfolder like `src/`. If you have a project-specific build artifact directory that isn't in the default skip list, point Ropeman at a different parent so that folder is left out.

### Symptom — A specific file is marked as "unparsed"

- **Cause**: The in-browser parser failed on an unusual dialect, a syntax-error file, or a non-UTF-8 encoding.
- **Fix**: Check the file opens cleanly in an editor. Unparsed files are skipped and don't block the rest of the analysis.

## AI Response Errors

### Symptom — "429 Too Many Requests" when analyzing in Demo mode

- **Cause**: Demo mode uses a shared rate-limited quota. You've hit the temporary ceiling.
- **Fix**: Wait a few minutes, or switch to **API Key (BYOK)** mode with your own key. See [AI Modes](/docs/en/ai-modes).

### Symptom — "500 Internal Server Error" during analysis

- **Cause 1**: The AI provider is temporarily unavailable.
- **Cause 2**: The code structure summary exceeds what the model accepts.
- **Fix**: Retry after a minute. If it persists, reduce the summary cap in **Settings → Code Summary Size Limit** (try 150 KB), or switch to a larger-context model in BYOK mode.

### Symptom — AI returns malformed JSON and the diagram is empty

- **Cause**: Some smaller models occasionally emit responses Ropeman can't parse into nodes/edges.
- **Fix**: Try a stronger model (Gemini 2.5 Pro, Claude Sonnet 4, GPT-4o). If you're on WebGPU, switch to a larger local model.

## Cache Issues

### Symptom — Old diagram keeps showing up even after code changes

- **Cause**: Analysis results are cached in the browser for instant reloads.
- **Fix**: Open **Settings** and click **Clear Cache**. Or toggle **Analysis Cache** off before the next run to force a fresh analysis.

### Symptom — WebGPU model keeps re-downloading

- **Cause**: The cached model weights were cleared by the browser (low disk space, incognito mode, manual clear).
- **Fix**: Make sure you have at least a few GB of free disk space. Do not use WebGPU mode in a private browsing window.

## Browser Compatibility

### Symptom — "Open Folder" button does nothing in Firefox or Safari

- **Cause**: Firefox and Safari do not yet implement `showDirectoryPicker()` from the File System Access API.
- **Fix**: **Drag and drop** the folder from your OS file manager onto the Ropeman landing area instead. All other features work.

### Symptom — WebGPU mode is greyed out

- **Cause**: Your browser or GPU doesn't support WebGPU, or the flag is disabled.
- **Fix**: Use Chrome 113+ or Edge 113+ on a reasonably modern GPU. Check `chrome://gpu` and confirm WebGPU is listed as "Hardware accelerated". If not, use another mode.

### Symptom — The Bridge page can't connect to `ropeman serve`

- **Cause**: serve is not running, the port or the token does not match, or the browser blocked the request to `127.0.0.1`.
- **Fix**: The page says which case it is. [Bridge Setup](/docs/en/bridge-setup) covers each case, how to reset a blocked permission, and local mode for Safari.

### Symptom — Keyboard shortcuts collide with browser shortcuts

- **Cause**: `Ctrl+W` closes browser tabs; `Ctrl+Shift+D` may bookmark all tabs depending on the browser.
- **Fix**: Ropeman's shortcuts fire when the canvas or a Ropeman UI element has focus. Click the canvas first, or use the alternative menu entries.

## File System Access

### Symptom — "Permission to read folder revoked" after switching tabs

- **Cause**: Some browsers revoke File System Access API permissions when you leave and return to the tab.
- **Fix**: Reopen the folder when prompted. The semantic cache means the diagram reloads instantly — only re-granting access is needed.

## Still Stuck?

- Check the browser DevTools console for error messages — they often point at the exact file or endpoint.
- Visit the [FAQ](/docs/en/faq) for general questions.
- Email [contact@ropeman.dev](mailto:contact@ropeman.dev) with a description, browser version, and (if possible) a console screenshot.
