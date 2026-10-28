from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

SymbolKind = Literal["function", "class", "method", "import"]
Strategy = Literal["bm25", "vector", "hybrid"]


class _Camel(BaseModel):
    """Serialises with camelCase keys so payloads match the app's skeleton.ts."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SkeletonSymbol(_Camel):
    name: str
    kind: SymbolKind
    badges: list[str] = Field(default_factory=list)
    children: list["SkeletonSymbol"] = Field(default_factory=list)
    # Agent-only extensions (optional, ignored by the app).
    signature: str | None = None
    docstring: str | None = None
    line: int | None = None


class SkeletonImport(_Camel):
    source: str
    specifiers: list[str] = Field(default_factory=list)


class SkeletonFile(_Camel):
    path: str
    language: str | None
    symbols: list[SkeletonSymbol] = Field(default_factory=list)
    imports: list[SkeletonImport] = Field(default_factory=list)


class SkeletonPayload(_Camel):
    project_name: str
    total_files: int
    total_symbols: int
    files: list[SkeletonFile]
    generated_at: str


class Chunk(BaseModel):
    id: str
    repo_id: str
    path: str
    symbol: str
    kind: str
    text: str


class SearchHit(BaseModel):
    chunk: Chunk
    score: float
    rank: int


class IndexRequest(BaseModel):
    repo_path: str
    repo_id: str


class IndexResponse(BaseModel):
    repo_id: str
    files: int
    symbols: int
    chunks: int


class QueryRequest(BaseModel):
    repo_id: str
    question: str = Field(min_length=1)
    strategy: Strategy = "hybrid"
    k: int = Field(default=5, ge=1, le=50)


class Citation(BaseModel):
    path: str
    symbol: str


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]
    # Citation numbers the model returned that do not match a retrieved chunk.
    invalid_citations: list[int]
    strategy: Strategy
    hits: list[SearchHit]
