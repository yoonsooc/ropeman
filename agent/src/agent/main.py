import threading

from fastapi import FastAPI, HTTPException, Request

from agent.config import Settings, get_settings
from agent.errors import (
    InvalidAnswerError,
    InvalidRepoPathError,
    RefusalError,
    UnknownRepoError,
    UpstreamError,
)
from agent.llm import AnthropicAnswerer, GeminiAnswerer
from agent.models import IndexRequest, IndexResponse, QueryRequest, QueryResponse
from agent.retrieval.vector import Embedder, GeminiEmbedder, LocalEmbedder, PgVectorStore
from agent.service import AgentService


def build_embedder(settings: Settings) -> Embedder:
    if settings.embedding_provider == "local":
        return LocalEmbedder(
            settings.embedding_model, settings.embedding_dim, settings.model_cache_dir
        )
    return GeminiEmbedder(settings.embedding_model, settings.embedding_dim, settings.gemini_api_key)


def build_service(settings: Settings) -> AgentService:
    if settings.llm_provider == "anthropic":
        answerer = AnthropicAnswerer(settings.anthropic_model, settings.anthropic_api_key)
    else:
        answerer = GeminiAnswerer(settings.gemini_llm_model, settings.gemini_api_key)
    return AgentService(
        store=PgVectorStore(
            settings.database_url, settings.embedding_model, settings.embedding_dim
        ),
        embedder=build_embedder(settings),
        answerer=answerer,
        rrf_k=settings.rrf_k,
        max_files=settings.max_files,
        max_file_bytes=settings.max_file_bytes,
        repos_root=settings.repos_root,
    )


def create_app(service: AgentService | None = None) -> FastAPI:
    app = FastAPI(title="ropeman-agent")
    app.state.service = service

    lock = threading.Lock()

    def get_service(request: Request) -> AgentService:
        # Built on first use so tests and /health need no DB; the lock stops two
        # concurrent first requests from each loading the model and opening a pool.
        with lock:
            if request.app.state.service is None:
                request.app.state.service = build_service(get_settings())
        return request.app.state.service

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/index", response_model=IndexResponse)
    def index(body: IndexRequest, request: Request) -> IndexResponse:
        try:
            return get_service(request).index_repo(body.repo_path, body.repo_id)
        except InvalidRepoPathError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.post("/query", response_model=QueryResponse)
    def query(body: QueryRequest, request: Request) -> QueryResponse:
        try:
            return get_service(request).query(body)
        except UnknownRepoError as error:
            raise HTTPException(
                status_code=404, detail=f"repo not indexed: {body.repo_id}"
            ) from error
        except RefusalError as error:
            raise HTTPException(status_code=422, detail="the model declined to answer") from error
        except (InvalidAnswerError, UpstreamError) as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

    return app


app = create_app()
