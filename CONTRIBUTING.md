# Contributing to Ropeman

Ropeman maps a repository into an architecture diagram. It extracts every file, symbol and import without a model, an AI model or your coding agent names the parts, and a verifier checks each name against the code. It ships as three things from this repository: the web app at [ropeman.dev](https://ropeman.dev), the `@ropeman/bridge` CLI on npm (`ropeman serve`, `map`, `verify`, `inbox`), and the agent skill in [`skill/ropeman/`](skill/ropeman/SKILL.md).

If you use a coding agent, point it at [AGENTS.md](AGENTS.md). It has the repository layout, conventions and test rules, and this guide does not repeat them.

## Set up

You need Node 22 or later (`engines` in [`bridge/package.json`](bridge/package.json); CI runs Node 22) and git.

```bash
git clone https://github.com/yoonsooc/ropeman.git
cd ropeman
npm ci                   # app, extraction core and git hooks
npm ci --prefix bridge   # only to build or type-check the bridge
npm ci --prefix workers  # only to run the Cloudflare Worker tests
```

The commands for tests, build, lint, type checks and E2E are in the [Commands table of AGENTS.md](AGENTS.md#commands).

## Run it locally

The app:

```bash
npm run dev
```

Open the address Vite prints (`http://localhost:5173` by default) in Chrome or Edge. Opening a local folder uses the File System Access API, which only Chromium browsers support in full. Demo mode calls the deployed demo Worker, which accepts the dev server on its default port, so you need no Worker running locally.

The bridge, built from this checkout:

```bash
npm run build:bridge
node bridge/dist/server.mjs serve --root .
```

It prints where its token is. Open `http://localhost:5173/bridge` from the dev server above and paste the token; the bridge accepts the local dev server's origin. To use the viewer the bridge ships instead (`--local`), build it first with `npm run build && npm run bundle:viewer`. The flags, the token and the security checks are in [bridge/README.md](bridge/README.md).

## Pull requests

- Keep a pull request to one change, and say why it is needed, what changed and how you checked it. The [pull request template](.github/PULL_REQUEST_TEMPLATE.md) asks for exactly that.
- Run `npm run test:unit && npm run build && npm run lint` before you push. CI runs these and the type checks, Worker tests and E2E on every pull request, and a pull request merges only when CI passes.
- A change to `src/lib/services/` or `src/lib/stores/` comes with its `.test.ts`. A bug fix comes with a test that fails without the fix.
- When a change moves files or changes how parts fit together, update [`docs/ARCH.md`](docs/ARCH.md) in the same pull request. A new framework, storage or major dependency needs an ADR in [`docs/adr/`](docs/adr/README.md). ARCH and ADRs are written in Korean.
- A change to the UI comes with a screenshot or a short recording.
- A change to the bridge's commands, flags or output updates [bridge/README.md](bridge/README.md) and adds a line under Unreleased in [bridge/CHANGELOG.md](bridge/CHANGELOG.md).
- Dependabot opens the dependency updates every week ([`.github/dependabot.yml`](.github/dependabot.yml)): one pull request with the minor and patch updates for each of the root, `bridge/` and `workers/`, one for GitHub Actions, and one per major update. `web-tree-sitter` and the `tree-sitter-*` packages come one at a time, because a grammar `.wasm` must match the runtime. Majors we hold back on purpose are listed under `ignore` with the reason. Security updates come when an alert opens, one pull request per directory. You do not need to open a pull request that only bumps a dependency.

Merging to `main` deploys ropeman.dev. Bridge releases are separate and described in [RELEASING.md](RELEASING.md).

## Questions and reports

Ask questions and report bugs in [GitHub issues](https://github.com/yoonsooc/ropeman/issues). For a security problem, do not open an issue; follow [SECURITY.md](SECURITY.md).

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
