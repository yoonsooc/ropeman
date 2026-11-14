from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://ropeman:ropeman@localhost:5433/ropeman"

    llm_provider: Literal["anthropic", "gemini"] = "anthropic"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5-5"
    gemini_api_key: str | None = None
    gemini_llm_model: str = "gemini-3.5-flash"

    # Pinned for reproducibility: changing the model requires re-indexing
    # (each model gets its own pgvector table). "gemini" uses gemini-embedding-001.
    embedding_provider: Literal["local", "gemini"] = "local"
    embedding_model: str = "jinaai/jina-embeddings-v2-base-code"
    embedding_dim: int = 768
    model_cache_dir: str = ".data/models"

    default_k: int = 5
    rrf_k: int = 60

    # POST /index only accepts directories under this root (their files reach the LLM).
    repos_root: str = ".data/repos"

    # Same limits as the browser app (FileSystemHandle constraints).
    max_files: int = 2000
    max_file_bytes: int = 500_000


@lru_cache
def get_settings() -> Settings:
    return Settings()
