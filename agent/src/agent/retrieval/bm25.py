from rank_bm25 import BM25Okapi

from agent.models import Chunk, SearchHit
from agent.retrieval.tokenize import tokenize


class BM25Retriever:
    """In-memory BM25 over chunk texts (k1=1.5, b=0.75, rank-bm25 defaults)."""

    def __init__(self, chunks: list[Chunk]):
        self.chunks = chunks
        corpus = [tokenize(chunk.text) for chunk in chunks]
        self._bm25 = BM25Okapi(corpus) if any(corpus) else None

    def search(self, query: str, k: int) -> list[SearchHit]:
        terms = tokenize(query)
        if self._bm25 is None or not terms:
            return []
        scores = self._bm25.get_scores(terms)
        ranked = sorted(
            (i for i, score in enumerate(scores) if score > 0), key=lambda i: -scores[i]
        )
        return [
            SearchHit(chunk=self.chunks[i], score=float(scores[i]), rank=rank)
            for rank, i in enumerate(ranked[:k], start=1)
        ]
