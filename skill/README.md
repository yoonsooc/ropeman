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

Ask the agent to "map this repo". If the repository must stay unchanged, say so. The agent then writes its output outside the repository instead of in `.ropeman/`. Inside the repository `.ropeman/` gets a `.gitignore`, so git does not commit it.

The agent runs these commands with fixed arguments:

| Command                                              | What it does                                                                                                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ropeman map --root <repo> --out <folder>`           | Extracts the repository, applies `names.json`, writes `ropeman.json` (only names that pass the verifier) and `work.json` (what to name next), and prints the coverage and the problems as JSON |
| `ropeman verify --root <repo> --map <ropeman.json>`  | Checks any `ropeman.json` against the code and prints the violations as JSON                                                                                                                   |
| `ropeman serve --root <repo> --out <folder> --local` | Serves the map with the viewer at `http://127.0.0.1:9800/bridge#token=…`                                                                                                                       |
| `ropeman inbox --out <folder>`                       | Prints what workers named since the agent last looked, and folders still waiting for it                                                                                                        |

The agent names the top two stages when it maps the repository and writes `brief.md`: what you want from the map, the project's terms, its naming conventions and the names so far. A deeper folder you open in the browser is named by a headless `claude` worker that gets the brief, and several folders are named at once. The page shows which worker named a folder and how many worker runs serve has made since it started, over all folders. On your next message the agent reads what the workers named, so it knows what you explored and can change names you ask about. Without `claude`, opened folders wait on a queue for the agent's next turn. serve uses `gemini` only when you start it with `--cli gemini`.

Every command takes argv only. The agent writes the names to a file and never puts them into a command line. See `bridge/README.md` for the server's security model.

## Not verified

- Agents other than Claude Code (Codex, Gemini CLI, Cursor and others).
- Windows.
