"""Embeddings and vector storage (pgvector, plus an in-memory store for tests)."""

import hashlib
import re
from typing import Protocol

import numpy as np

from agent.models import Chunk, SearchHit

EMBED_BATCH = 50


class Embedder(Protocol):
    model: str
    dim: int

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class LocalEmbedder:
    """ONNX model run on this machine via fastembed. No API key; code never leaves the host."""

    # A batch is padded to its longest text and attention memory grows with length squared;
    # the default batch of 256 with ~6k-char chunks was OOM-killed on a 24 GB machine.
    BATCH_SIZE = 8
    MAX_CHARS = 2000  # roughly 512 tokens; signature, doc and file path come first in a chunk

    def __init__(self, model: str, dim: int, cache_dir: str | None = None):
        from fastembed import TextEmbedding

        self.model = model
        self.dim = dim
        self._model = TextEmbedding(model_name=model, cache_dir=cache_dir)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        clipped = [text[: self.MAX_CHARS] for text in texts]
        vectors = self._model.passage_embed(clipped, batch_size=self.BATCH_SIZE)
        return [vector.tolist() for vector in vectors]

    def embed_query(self, text: str) -> list[float]:
        return next(iter(self._model.query_embed(text))).tolist()


class GeminiEmbedder:
    def __init__(self, model: str, dim: int, api_key: str | None = None):
        from google import genai

        self.model = model
        self.dim = dim
        self._client = genai.Client(api_key=api_key) if api_key else genai.Client()

    def _embed(self, texts: list[str], task_type: str) -> list[list[float]]:
        from google.genai import types

        config = types.EmbedContentConfig(task_type=task_type, output_dimensionality=self.dim)
        vectors: list[list[float]] = []
        for start in range(0, len(texts), EMBED_BATCH):
            result = self._client.models.embed_content(
                model=self.model, contents=texts[start : start + EMBED_BATCH], config=config
            )
            vectors.extend(embedding.values for embedding in result.embeddings)
        return vectors

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed(texts, "RETRIEVAL_DOCUMENT")

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text], "RETRIEVAL_QUERY")[0]


class VectorStore(Protocol):
    def replace_repo(self, repo_id: str, chunks: list[Chunk], vectors: list[list[float]]): ...

    def load_chunks(self, repo_id: str) -> list[Chunk]: ...

    def search(self, repo_id: str, query_vector: list[float], k: int) -> list[SearchHit]: ...


def _normalise(vector) -> np.ndarray:
    array = np.asarray(vector, dtype=np.float32)
    norm = np.linalg.norm(array)
    return array / norm if norm else array


class InMemoryVectorStore:
    def __init__(self):
        self._repos: dict[str, tuple[list[Chunk], np.ndarray]] = {}

    def replace_repo(self, repo_id, chunks, vectors):
        matrix = np.stack([_normalise(v) for v in vectors]) if vectors else np.zeros((0, 0))
        self._repos[repo_id] = (list(chunks), matrix)

    def load_chunks(self, repo_id):
        return list(self._repos.get(repo_id, ([], None))[0])

    def search(self, repo_id, query_vector, k):
        chunks, matrix = self._repos.get(repo_id, ([], np.zeros((0, 0))))
        if not chunks:
            return []
        scores = matrix @ _normalise(query_vector)
        order = np.argsort(-scores)[:k]
        return [
            SearchHit(chunk=chunks[i], score=float(scores[i]), rank=rank)
            for rank, i in enumerate(order, start=1)
        ]


PG_IDENTIFIER_MAX = 63


def table_name(model: str, dim: int) -> str:
    """Safe SQL identifier ([a-z0-9_] only) that is unique per (model, dim)."""
    slug = re.sub(r"[^a-z0-9]+", "_", model.lower()).strip("_")
    suffix = f"_d{dim}"
    name = f"chunks_{slug}{suffix}"
    if len(name) <= PG_IDENTIFIER_MAX:
        return name
    # Truncating would drop the dimension or merge two long model names; keep a hash instead.
    digest = hashlib.sha1(model.encode()).hexdigest()[:8]
    head = f"chunks_{slug}"[: PG_IDENTIFIER_MAX - len(suffix) - len(digest) - 1]
    return f"{head}_{digest}{suffix}"


class PgVectorStore:
    """One table per embedding model and dimension so vector spaces never mix.

    Each call takes its own pooled connection: FastAPI runs sync endpoints in a
    threadpool, and a re-index transaction must not be shared with readers.
    """

    def __init__(self, database_url: str, model: str, dim: int, max_connections: int = 4):
        import psycopg
        from pgvector.psycopg import register_vector
        from psycopg_pool import ConnectionPool

        self.dim = dim
        self.table = table_name(model, dim)
        # The extension must exist before register_vector can look up the type.
        with psycopg.connect(database_url, autocommit=True) as conn:
            conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            conn.execute(
                f"""CREATE TABLE IF NOT EXISTS {self.table} (
                    id text NOT NULL,
                    repo_id text NOT NULL,
                    path text NOT NULL,
                    symbol text NOT NULL,
                    kind text NOT NULL,
                    text text NOT NULL,
                    embedding vector({dim}) NOT NULL,
                    PRIMARY KEY (repo_id, id)
                )"""
            )
        self._pool = ConnectionPool(
            database_url,
            min_size=1,
            max_size=max_connections,
            kwargs={"autocommit": True},
            configure=register_vector,
            open=True,
        )

    def close(self):
        self._pool.close()

    def replace_repo(self, repo_id, chunks, vectors):
        with self._pool.connection() as conn, conn.transaction(), conn.cursor() as cur:
            cur.execute(f"DELETE FROM {self.table} WHERE repo_id = %s", (repo_id,))
            cur.executemany(
                f"INSERT INTO {self.table} (id, repo_id, path, symbol, kind, text, embedding) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                [
                    (c.id, repo_id, c.path, c.symbol, c.kind, c.text, _normalise(v))
                    for c, v in zip(chunks, vectors, strict=True)
                ],
            )

    def load_chunks(self, repo_id):
        with self._pool.connection() as conn:
            rows = conn.execute(
                f"SELECT id, repo_id, path, symbol, kind, text FROM {self.table} "
                "WHERE repo_id = %s ORDER BY id",
                (repo_id,),
            ).fetchall()
        return [
            Chunk(id=r[0], repo_id=r[1], path=r[2], symbol=r[3], kind=r[4], text=r[5]) for r in rows
        ]

    def search(self, repo_id, query_vector, k):
        query = _normalise(query_vector)
        with self._pool.connection() as conn:
            rows = conn.execute(
                f"SELECT id, repo_id, path, symbol, kind, text, 1 - (embedding <=> %s) AS score "
                f"FROM {self.table} WHERE repo_id = %s ORDER BY embedding <=> %s LIMIT %s",
                (query, repo_id, query, k),
            ).fetchall()
        return [
            SearchHit(
                chunk=Chunk(id=r[0], repo_id=r[1], path=r[2], symbol=r[3], kind=r[4], text=r[5]),
                score=float(r[6]),
                rank=rank,
            )
            for rank, r in enumerate(rows, start=1)
        ]
