"""Run every retrieval strategy on the gold set and print markdown tables.

Retrieval only: the LLM is never called, so this costs nothing beyond local compute.
Repos that are not indexed yet are indexed first (from .data/repos/<repo>).

    uv run python -m eval.run
"""

import json
import time
from itertools import combinations
from pathlib import Path

from agent.config import get_settings
from agent.main import build_service
from eval.metrics import hit_at_k, mean, paired_bootstrap, recall_at_k, reciprocal_rank

GOLDSET = Path("eval/goldset.jsonl")
RESULTS = Path("eval/results/W1.jsonl")
STRATEGIES = ("bm25", "vector", "hybrid")
K = 5
DEPTH = 10  # chunks retrieved per question; MRR looks this deep
SEED = 0


def load_goldset() -> list[dict]:
    items = [json.loads(line) for line in GOLDSET.open()]
    return [item for item in items if item["expected"]]


def ensure_indexed(service, items: list[dict]) -> None:
    for repo_id, repo in sorted({(i["repo_id"], i["repo"]) for i in items}):
        if not service.store.load_chunks(repo_id):
            print(f"indexing {repo_id} ...")
            service.index_repo(str(Path(".data/repos") / repo), repo_id)


def score(service, items: list[dict]) -> list[dict]:
    rows = []
    for item in items:
        expected = {e["path"] for e in item["expected"]}
        for strategy in STRATEGIES:
            started = time.perf_counter()
            hits = service.retrieve(item["repo_id"], item["question"], strategy, DEPTH)
            elapsed_ms = (time.perf_counter() - started) * 1000
            paths = [hit.chunk.path for hit in hits]
            rows.append(
                {
                    "id": item["id"],
                    "repo": item["repo"],
                    "strategy": strategy,
                    "recall@5": recall_at_k(paths, expected, K),
                    "hit@5": hit_at_k(paths, expected, K),
                    "rr": reciprocal_rank(paths, expected),
                    "latency_ms": round(elapsed_ms, 1),
                    "top_paths": paths[:K],
                }
            )
    return rows


def _by(rows, strategy, repo=None, metric="recall@5"):
    picked = [r for r in rows if r["strategy"] == strategy and (repo is None or r["repo"] == repo)]
    return [r[metric] for r in sorted(picked, key=lambda r: r["id"])]


def report(rows: list[dict]) -> str:
    repos = sorted({r["repo"] for r in rows})
    lines = ["| strategy | " + " | ".join(f"Recall@5 {r}" for r in repos)]
    lines[0] += " | Recall@5 all | Hit@5 all | MRR@10 all | p50 ms |"
    lines.append("|---" * (len(repos) + 5) + "|")
    for s in STRATEGIES:
        per_repo = [f"{mean(_by(rows, s, r)):.3f}" for r in repos]
        latencies = sorted(_by(rows, s, metric="latency_ms"))
        lines.append(
            f"| {s} | "
            + " | ".join(per_repo)
            + f" | {mean(_by(rows, s)):.3f} | {mean(_by(rows, s, metric='hit@5')):.3f}"
            + f" | {mean(_by(rows, s, metric='rr')):.3f} | {latencies[len(latencies) // 2]:.0f} |"
        )
    lines += [
        "",
        "| pair (a - b) | metric | mean diff | 95% CI | CI excludes 0 |",
        "|---|---|---|---|---|",
    ]
    for a, b in combinations(STRATEGIES, 2):
        for metric in ("recall@5", "rr"):
            diff, low, high = paired_bootstrap(
                _by(rows, a, metric=metric), _by(rows, b, metric=metric), seed=SEED
            )
            excludes = "yes" if low > 0 or high < 0 else "no"
            name = "MRR@10" if metric == "rr" else "Recall@5"
            lines.append(
                f"| {a} - {b} | {name} | {diff:+.3f} | [{low:+.3f}, {high:+.3f}] | {excludes} |"
            )
    return "\n".join(lines)


def main():
    settings = get_settings()
    service = build_service(settings)
    items = load_goldset()
    ensure_indexed(service, items)
    rows = score(service, items)
    RESULTS.parent.mkdir(parents=True, exist_ok=True)
    RESULTS.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))
    print(
        f"questions={len(items)} k={K} depth={DEPTH} seed={SEED} "
        f"embedding={settings.embedding_model} rrf_k={settings.rrf_k}\n"
    )
    print(report(rows))


if __name__ == "__main__":
    main()
