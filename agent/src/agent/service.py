from pathlib import Path

from agent.errors import InvalidRepoPathError, UnknownRepoError
from agent.indexer.chunker import chunk_payload
from agent.indexer.skeleton import extract_skeleton
from agent.llm import Answerer, resolve_citations
from agent.models import IndexResponse, QueryRequest, QueryResponse, SearchHit, Strategy
from agent.retrieval.bm25 import BM25Retriever
from agent.retrieval.hybrid import rrf
from agent.retrieval.vector import Embedder, VectorStore

# Each retriever contributes this many candidates before RRF trims to k.
HYBRID_CANDIDATES = 20


class AgentService:
    def __init__(
        self,
        store: VectorStore,
        embedder: Embedder,
        answerer: Answerer,
        rrf_k: int = 60,
        max_files: int = 2000,
        max_file_bytes: int = 500_000,
        repos_root: str | Path | None = None,
    ):
        self.store = store
        self.embedder = embedder
        self.answerer = answerer
        self.rrf_k = rrf_k
        self.max_files = max_files
        self.max_file_bytes = max_file_bytes
        # Only directories under this root may be indexed; their files are sent to the LLM.
        self.repos_root = Path(repos_root).resolve() if repos_root is not None else None
        self._bm25: dict[str, BM25Retriever] = {}

    def _check_repo_path(self, repo_path: str) -> Path:
        path = Path(repo_path).resolve()
        if self.repos_root is not None and not path.is_relative_to(self.repos_root):
            raise InvalidRepoPathError(f"repo_path must be under {self.repos_root}")
        if not path.is_dir():
            raise InvalidRepoPathError(f"not a directory: {path}")
        return path

    def index_repo(self, repo_path: str, repo_id: str) -> IndexResponse:
        payload = extract_skeleton(
            self._check_repo_path(repo_path), repo_id, self.max_files, self.max_file_bytes
        )
        chunks = chunk_payload(repo_id, payload)
        vectors = self.embedder.embed_documents([chunk.text for chunk in chunks])
        self.store.replace_repo(repo_id, chunks, vectors)
        self._bm25[repo_id] = BM25Retriever(chunks)
        return IndexResponse(
            repo_id=repo_id,
            files=payload.total_files,
            symbols=payload.total_symbols,
            chunks=len(chunks),
        )

    def _bm25_for(self, repo_id: str) -> BM25Retriever:
        if repo_id not in self._bm25:
            chunks = self.store.load_chunks(repo_id)
            if not chunks:
                raise UnknownRepoError(repo_id)
            self._bm25[repo_id] = BM25Retriever(chunks)
        return self._bm25[repo_id]

    def retrieve(self, repo_id: str, question: str, strategy: Strategy, k: int) -> list[SearchHit]:
        bm25 = self._bm25_for(repo_id)
        if strategy == "bm25":
            return bm25.search(question, k)
        vector_k = k if strategy == "vector" else max(k, HYBRID_CANDIDATES)
        vector_hits = self.store.search(repo_id, self.embedder.embed_query(question), vector_k)
        if strategy == "vector":
            return vector_hits
        lexical_hits = bm25.search(question, max(k, HYBRID_CANDIDATES))
        return rrf([lexical_hits, vector_hits], k=self.rrf_k, limit=k)

    def query(self, request: QueryRequest) -> QueryResponse:
        hits = self.retrieve(request.repo_id, request.question, request.strategy, request.k)
        if not hits:
            return QueryResponse(
                answer="No matching code was found for this question.",
                citations=[],
                invalid_citations=[],
                strategy=request.strategy,
                hits=[],
            )
        draft = self.answerer.answer(request.question, hits)
        citations, invalid = resolve_citations(draft, hits)
        return QueryResponse(
            answer=draft.answer,
            citations=citations,
            invalid_citations=invalid,
            strategy=request.strategy,
            hits=hits,
        )
