# Security Policy

## Supported versions

| Component                                          | Supported                                                    |
| -------------------------------------------------- | ------------------------------------------------------------ |
| [ropeman.dev](https://ropeman.dev) and its Workers | The deployed version. Every merge to `main` redeploys it     |
| `@ropeman/bridge` on npm                           | The latest minor release (0.4.x). Older versions get no fix  |
| The agent skill (`skill/ropeman/SKILL.md`)         | The copy at the `bridge-v<version>` tag of the latest bridge |

A fix ships as a new deploy of the site or a new bridge patch release. Upgrade with `npm install -g @ropeman/bridge@<version>`.

## Reporting a vulnerability

Do not open a public issue, pull request or discussion with the details of a vulnerability before it is fixed.

Report it privately through GitHub: open the [Security tab](https://github.com/yoonsooc/ropeman/security) of this repository and choose **Report a vulnerability**. Only the maintainer sees the report.

Include:

- The component (the web app, the bridge, a Worker, the skill) and its version (`ropeman --version`, or the date you used the site)
- What an attacker can do, and what they need first (a page you visit, a repository you map, access to your machine)
- Steps to reproduce, or a proof of concept
- Your browser and OS, when they matter

Ropeman has one maintainer, so a reply can take a few days. The report stays private until a fix is out.

## Scope

In scope:

- The web app at [ropeman.dev](https://ropeman.dev) (`src/`)
- The `@ropeman/bridge` CLI and local server (`bridge/`, with the extraction core in `packages/core/`): for example a page that reaches the bridge without the token, a read outside `--root`, or a mapped repository that makes the bridge or a worker CLI run something
- The four Cloudflare Workers (`workers/`): `demo.ropeman.dev`, `proxy.ropeman.dev`, `share.ropeman.dev` and `explore.ropeman.dev`
- The agent skill (`skill/`)

Out of scope:

- The AI providers Ropeman calls (Google, Anthropic, OpenAI) and the coding agents and CLIs it runs. Report those to their vendors
- Denial of service by request volume, including hitting the demo Worker's rate limit
- Findings that need an `--allow-origin` you added for a site you do not control. [bridge/README.md](bridge/README.md#security) explains why that is unsafe

What the bridge checks on each connection, and what leaves the browser in each AI mode, is described in [bridge/README.md](bridge/README.md#security) and in [Security & Privacy](https://ropeman.dev/docs/en/security) on ropeman.dev.
