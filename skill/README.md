# Ropeman skill

`ropeman/` is an [Agent Skill](https://agentskills.io): a folder with a `SKILL.md`. With it installed, ask your coding agent to "map this repo". The agent builds the map with the `ropeman` command, names each part one stage at a time, fixes what the verifier refuses, and gives you a local address. In the browser, clicking a folder drills into it and clicking a file opens its source.

The skill uses only shell commands and file writes. It does not need subagents, hooks or a particular model. It is tested with Claude Code. Other agents that read `SKILL.md` folders should work the same way, but nobody has tested them yet.

[한국어](README-KO.md)

## 1. Install the `ropeman` command

The skill runs `ropeman` (the `@ropeman/bridge` package, 0.3.0 or later, Node 22 or later).

Today, from a checkout of this repository (0.3.0 is not on npm yet):

```bash
npm ci && npm ci --prefix bridge
cd bridge && npm pack            # builds the app, the bridge and the viewer, writes ropeman-bridge-0.3.0.tgz
npm install -g ./ropeman-bridge-0.3.0.tgz
ropeman --version                # 0.3.0
```

After 0.3.0 is published (pending):

```bash
npm install -g @ropeman/bridge
```

## 2. Install the skill

Copy the `ropeman` folder into the folder your agent loads skills from. For Claude Code:

```bash
cp -R skill/ropeman ~/.claude/skills/ropeman
```

An agent without skill support can follow the same steps: paste the text of `ropeman/SKILL.md` into the conversation.

## 3. Use it

Ask the agent to "map this repo". If the repository must stay unchanged, say so. The agent then writes its output outside the repository instead of in `.ropeman/`.

The agent runs these commands with fixed arguments:

| Command                                              | What it does                                                                                                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ropeman map --root <repo> --out <folder>`           | Extracts the repository, applies `names.json`, writes `ropeman.json` (only names that pass the verifier) and `work.json` (what to name next), and prints the coverage and the problems as JSON |
| `ropeman verify --root <repo> --map <ropeman.json>`  | Checks any `ropeman.json` against the code and prints the violations as JSON                                                                                                                   |
| `ropeman serve --root <repo> --out <folder> --local` | Serves the map with the viewer at `http://127.0.0.1:9800/bridge#token=…`                                                                                                                       |
| `ropeman next --out <folder>`                        | Prints the folders you opened in the browser that have no names yet                                                                                                                            |

The agent names the top two stages when it maps the repository. A deeper folder you open in the browser waits on a queue, and the page says so; the agent names it the next time you send it a message, and the open page shows the names. Say "follow the browser" to have the agent name folders as you open them. While it follows, that conversation cannot answer you; interrupt the agent to stop it.

Every command takes argv only. The agent writes the names to a file and never puts them into a command line. See `bridge/README.md` for the server's security model.

## Not verified

- Agents other than Claude Code (Codex, Gemini CLI, Cursor and others).
- Windows.
