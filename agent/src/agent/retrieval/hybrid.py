from agent.models import SearchHit


def rrf(rankings: list[list[SearchHit]], k: int = 60, limit: int | None = None) -> list[SearchHit]:
    """Reciprocal Rank Fusion: score(d) = sum over rankings of 1 / (k + rank).

    Ties keep first-seen order (earlier rankings first), so results are deterministic.
    """
    scores: dict[str, float] = {}
    hits: dict[str, SearchHit] = {}
    first_seen: dict[str, int] = {}
    for ranking in rankings:
        for hit in ranking:
            scores[hit.chunk.id] = scores.get(hit.chunk.id, 0.0) + 1.0 / (k + hit.rank)
            hits.setdefault(hit.chunk.id, hit)
            first_seen.setdefault(hit.chunk.id, len(first_seen))
    ordered = sorted(scores, key=lambda cid: (-scores[cid], first_seen[cid]))[:limit]
    return [
        SearchHit(chunk=hits[chunk_id].chunk, score=scores[chunk_id], rank=rank)
        for rank, chunk_id in enumerate(ordered, start=1)
    ]
