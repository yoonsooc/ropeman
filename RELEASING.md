# Releasing

Two things ship from this repository on different schedules. The web app (ropeman.dev and its Workers) deploys on every merge to `main`. The `@ropeman/bridge` npm package, and the agent skill pinned to it, ship when the maintainer pushes a `bridge-v<version>` tag.

## The web app

Merging a pull request to `main` runs the `deploy` job in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) after the checks pass. It deploys the app to Cloudflare Pages, deploys only the Workers whose files changed (`scripts/changed-workers.mjs`), and runs `scripts/health-check.mjs`. There is no separate release step. The order and the secrets it needs are in [`docs/ARCH.md`](docs/ARCH.md) section 8. The `deploy*` npm scripts are for incident response only.

## The bridge

[`.github/workflows/release-bridge.yml`](.github/workflows/release-bridge.yml) publishes the package. You never run `npm publish` yourself, and no npm token is stored anywhere.

### 1. Open a version bump pull request

- Set `version` in `bridge/package.json` and `bridge/package-lock.json`.
- Update every install command and skill URL to the new version. `bridge/test/releasePin.test.ts` fails until each surface it lists names `@ropeman/bridge@<version>` and `raw.githubusercontent.com/yoonsooc/ropeman/bridge-v<version>/skill/ropeman/SKILL.md`, and until step 1 of `skill/ropeman/SKILL.md` asks for that version. `tests/onboarding.spec.ts` (E2E) checks the same command and URL in the app.
- Move the entries under Unreleased in [`bridge/CHANGELOG.md`](bridge/CHANGELOG.md) to a new section for the version and date, and update the compare links at the bottom.
- If the map schema changed, update Compatibility in [`bridge/README.md`](bridge/README.md). A new viewer reads maps from an older bridge, but an older viewer drops the fields a newer schema adds.

`chore(bridge): release 0.4.0` ([#101](https://github.com/yoonsooc/ropeman/pull/101)) is a complete example.

### 2. Merge, then tag the merge commit right away

```bash
git fetch origin main
git tag bridge-v<version> origin/main   # the merge commit of the bump PR
git push origin bridge-v<version>
```

Push the tag as soon as the pull request merges. You cannot tag first, because the workflow checks that the tagged commit is on `main`. You also do not need to wait for the deploy, because the workflow waits for it.

### 3. What the workflow checks

The `build` job has no OIDC token. In order, it:

1. Checks the tag has the form `bridge-v<major>.<minor>.<patch>`.
2. Checks the tagged commit is on `main` and `bridge/package.json` has the tag's version.
3. Waits up to 30 minutes for the `ci.yml` run of that commit, including its `deploy` job, to succeed. So ropeman.dev always ships before the package.
4. Stops without publishing if npm already has the version, so a rerun after success does nothing. Only an `E404` counts as missing; any other npm error fails the run.
5. Runs `npm pack` (its `prepack` builds the app, the bridge and the bundled viewer), installs the tarball globally, checks `ropeman --version`, and runs `bridge/scripts/smoke.mjs` against a fixture with that binary.

The `publish` job runs in the `npm-release` environment with `id-token: write`. It downloads only the tarball, without a checkout or `npm ci`, so no install script or build plugin ever runs next to the token, and runs `npm publish` with npm 11.17.0 (trusted publishing needs npm 11.5.1 or later; Node 22 ships npm 10). npm authenticates the run through trusted publishing (OIDC) and attaches provenance. Then the job waits up to 15 minutes for npm to list the version (0.3.0 took about 7). If npm still does not list it, the job only warns, because the publish itself succeeded.

Trusted publishing depends on settings outside this repository:

- On npmjs.com, the package's trusted publisher names the repository `yoonsooc/ropeman`, the workflow file `release-bridge.yml` and the environment `npm-release`. Renaming the file or the environment breaks publishing until that setting changes too.
- On GitHub, the `npm-release` environment admits only `main` and `bridge-v*` tags.
- npm compares the provenance with `repository.url` in `bridge/package.json`, which `releasePin.test.ts` pins.

Pushing or moving the tag starts a run. To retry a failed run without moving it: `gh workflow run release-bridge.yml -f tag=bridge-v<version>`.

### 4. Expect a 20 to 40 minute window

From the merge until npm lists the version (CI, deploy, the release run and npm's own delay), the new install command fails with `ETARGET` and the new skill URL returns 404, because the landing page and docs already name a version that is not out yet. This is a release in progress, not an outage.

### 5. Verify

```bash
npm view @ropeman/bridge@<version> version
npm install -g @ropeman/bridge@<version> && ropeman --version
curl -fsSI https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v<version>/skill/ropeman/SKILL.md
```

The first two print the version, and the last answers `200`.
