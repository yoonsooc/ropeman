# AGENTS.md

Guidance for contributors and coding agents working in this repository. Ropeman turns a codebase into an architecture diagram: it parses source in the browser (or in Node for the CLI), builds a code map, and asks an AI model or your coding agent to name its parts.

## Repository layout

| Path                | What it holds                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/`              | SvelteKit app (ropeman.dev). `src/lib/` holds `stores/`, `services/`, `components/`, `types/`, `workers/`, `utils/` |
| `src/content/docs/` | In-app docs (`en/`, `ko/`), rendered at `/docs`                                                                     |
| `packages/core/`    | Node extraction core and `ropeman-extract` CLI (not an npm workspace; uses the root dependencies)                   |
| `bridge/`           | `@ropeman/bridge`: the `ropeman serve`/`map`/`verify` CLI and the local Bridge server                               |
| `workers/`          | Cloudflare Workers (demo, proxy, share, explore), each with its own `wrangler.<name>.toml`                          |
| `skill/`            | The agent skill users install (`skill/ropeman/SKILL.md` is the canonical copy)                                      |
| `scripts/`          | Build, check, and data scripts (gallery pipeline in `scripts/explore/`)                                             |
| `tests/`            | Playwright E2E specs (`*.spec.ts`) and fixtures, including the hand-labelled graphs in `tests/fixtures/graphs/`     |
| `experiments/`      | Experiments outside the app, bridge, and workers. Each folder installs and runs on its own                          |
| `docs/`             | `ARCH.md` (architecture), `adr/` (decision records), `measurements/`                                                |

`docs/ARCH.md` section 1 has the file-by-file map. Read it before a structural change.

## Tech stack

- SvelteKit with Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`), `adapter-cloudflare`
- `@xyflow/svelte` (SvelteFlow) for the graph, `@dagrejs/dagre` for layout, `@orama/orama` for search
- `web-tree-sitter` WASM for parsing many languages, in a Web Worker
- File System Access API (`showDirectoryPicker`) to open local folders
- Vitest for unit tests, Playwright for E2E, Cloudflare Workers tested in workerd

## Commands

Node 22. Run `npm ci` once; it also installs the git hooks.

| Task                     | Command                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| Dev server               | `npm run dev`                                                                                    |
| Production preview       | `npm run preview` (builds, then `wrangler pages dev` on http://localhost:8788)                   |
| Unit tests               | `npm run test:unit` (covers `src/`, `bridge/test/`, `packages/*/test/`, `scripts/`)              |
| Build                    | `npm run build`                                                                                  |
| Lint                     | `npm run lint`                                                                                   |
| Type check (app)         | `npx svelte-check --tsconfig ./tsconfig.json`                                                    |
| Type check core / bridge | `npm run check:core`, `npm ci --prefix bridge && npm run check:bridge`                           |
| Worker tests             | `npm ci --prefix workers && npm test --prefix workers`                                           |
| E2E                      | `npx playwright install --only-shell chromium`, then `npm run bundle:viewer && npm run test:e2e` |

`npm run test:e2e` starts its own dev server on port 5180 (`E2E_PORT` overrides) and never reuses a server already on that port, so a dev server on 5173 from another checkout cannot stand in for the one under test. `workers/test/` is not part of `npm run test:unit`; it runs in workerd through `npm test --prefix workers`. CI (`.github/workflows/ci.yml`) runs every check above on each pull request. Before you push, run at least `npm run test:unit && npm run build && npm run lint`.

## Conventions

- Stores live in `src/lib/stores/` as module-level singletons that export getters and setters.
- Services live in `src/lib/services/` as pure functions or stateless modules.
- Components use Svelte 5 `$props()` destructuring. Do not use snippets.
- Parsing runs in `parserWorker.ts` (Web Worker) and reaches the app through `postMessage` and `parserService.ts`.
- Shared types live in `src/lib/types/`.

## Constraints

- The app is browser-only by default. `src/routes/+layout.ts` turns SSR off, and a route that renders on the server (the landing pages, `/docs`) opts back in in its own `+page.ts` or `+layout.ts`.
- File limits: `MAX_FILES=2000`, `MAX_FILE_SIZE=500KB`, defined once in `filePriority.ts`.
- Production deploys happen when CI's `deploy` job runs on a merge to main (`docs/ARCH.md` section 8). Do not deploy manually; the `deploy*` scripts are for incident response.

## Tests

- A change to a file in `src/lib/services/` or `src/lib/stores/` adds or updates its matching `.test.ts`. The pre-commit hook (`scripts/check-test-exists.mjs`) blocks the commit when the test file is missing.
- Write Vitest tests in Arrange, Act, Assert order, and mock external dependencies with `vi.mock()`.
- A fix for a bug that really happened includes a regression test for it.

## Docs and decisions

- When structure or a decision changes, update `docs/ARCH.md` and `docs/adr/` in the same commit as the code.
- Introducing or replacing a framework, storage, or major dependency needs an ADR in the same pull request. Write one also for an implementation pattern or a hard-to-reverse design decision whose reasoning is worth keeping. The format and numbering are in `docs/adr/README.md`. ARCH and ADRs are written in Korean.
- For Korean UI strings and docs, the `ko-unslop` skill in `.claude/skills/` lists the wording rules and the en/ko term table.

## Commits and pull requests

- Hooks run on commit (`lint-staged`: ESLint, Prettier, the test-file check). Fix what they report instead of skipping them with `--no-verify`.
- Never commit secrets. `.env`, `.env.local`, and `.dev.vars*` are gitignored; only `*.example` files are tracked. Worker secrets are set with `wrangler secret`, never in a `wrangler.*.toml`.
- Keep a pull request to one change. Describe why, what changed, and how you verified it (commands and results).
