"""SWE-QA jsonl -> goldset.jsonl.

SWE-QA (github.com/peng-weihan/SWE-QA-Bench, Apache-2.0) gives only `question` and
`answer`. The expected files are the `*.py` paths the reference answer mentions,
resolved against the repo at its pinned commit. Paths that do not resolve to exactly
one indexable file are kept in `unresolved` and left out of scoring.

    uv run python -m eval.swe_qa
"""

import json
import re
from pathlib import Path

from agent.indexer.skeleton import _python_files

# Repos and commits from SWE-QA's repo_commit.txt
REPOS = {"requests": "46e939b", "flask": "85c5d93"}
DATA_DIR = Path(".data/swe-qa")
REPOS_DIR = Path(".data/repos")
OUT = Path("eval/goldset.jsonl")

PY_PATH = re.compile(r"[\w./-]+\.py\b")


def mentioned_paths(answer: str) -> list[str]:
    """`*.py` paths in order of first mention, without leading './' or '/'."""
    seen: dict[str, None] = {}
    for match in PY_PATH.findall(answer):
        seen.setdefault(match.removeprefix("./").lstrip("/"), None)
    return list(seen)


def resolve(path: str, repo_files: set[str]) -> str | None:
    """Exact repo-relative match, else the single file whose path ends with it."""
    if path in repo_files:
        return path
    candidates = [f for f in repo_files if f.endswith("/" + path)]
    return candidates[0] if len(candidates) == 1 else None


def build(repo: str, commit: str, rows: list[dict], repo_files: set[str]) -> list[dict]:
    items = []
    for number, row in enumerate(rows, start=1):
        expected, unresolved = [], []
        for path in mentioned_paths(row["answer"]):
            resolved = resolve(path, repo_files)
            if resolved is None:
                unresolved.append(path)
            elif resolved not in expected:
                expected.append(resolved)
        items.append(
            {
                "id": f"{repo}-{number:02d}",
                "repo": repo,
                "repo_id": f"{repo}@{commit}",
                "commit": commit,
                "question": row["question"],
                "expected": [{"path": path} for path in expected],
                "unresolved": unresolved,
                "reference_answer": row["answer"],
            }
        )
    return items


def main():
    items = []
    for repo, commit in REPOS.items():
        root = (REPOS_DIR / repo).resolve()
        files = {p.relative_to(root).as_posix() for p in _python_files(root, 2000, 500_000)}
        rows = [json.loads(line) for line in (DATA_DIR / f"{repo}.jsonl").open()]
        items.extend(build(repo, commit, rows, files))
    OUT.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in items))
    scored = sum(1 for item in items if item["expected"])
    print(f"{len(items)} questions, {scored} with expected files -> {OUT}")


if __name__ == "__main__":
    main()
