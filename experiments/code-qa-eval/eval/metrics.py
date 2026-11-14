"""File-level retrieval metrics and paired bootstrap.

Retrieval returns ranked chunks; a question is scored on the files those chunks
belong to, because SWE-QA's reference answers name files, not symbols.
"""

import random


def recall_at_k(ranked_paths: list[str], expected: set[str], k: int) -> float:
    """Share of expected files that appear among the top-k chunks."""
    return len(set(ranked_paths[:k]) & expected) / len(expected)


def hit_at_k(ranked_paths: list[str], expected: set[str], k: int) -> float:
    """1 if any expected file appears among the top-k chunks."""
    return float(bool(set(ranked_paths[:k]) & expected))


def reciprocal_rank(ranked_paths: list[str], expected: set[str]) -> float:
    """1 / rank of the first chunk from an expected file, 0 if none was retrieved."""
    for rank, path in enumerate(ranked_paths, start=1):
        if path in expected:
            return 1.0 / rank
    return 0.0


def mean(values: list[float]) -> float:
    return sum(values) / len(values)


def paired_bootstrap(
    a: list[float], b: list[float], resamples: int = 10_000, seed: int = 0
) -> tuple[float, float, float]:
    """Mean of (a - b) and its 95% percentile interval, resampling questions."""
    assert len(a) == len(b) and a
    diffs = [x - y for x, y in zip(a, b, strict=True)]
    rng = random.Random(seed)
    n = len(diffs)
    means = sorted(mean([diffs[rng.randrange(n)] for _ in range(n)]) for _ in range(resamples))
    return mean(diffs), means[int(0.025 * resamples)], means[int(0.975 * resamples) - 1]
