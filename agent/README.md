# ropeman-agent

Answers questions about a Python repository from its tree-sitter skeleton (symbols, signatures, docstrings, imports; function bodies are not indexed), and compares retrieval strategies: BM25, vector (pgvector), and hybrid (RRF).

```bash
cp .env.example .env            # set ANTHROPIC_API_KEY
docker compose up -d --wait     # Postgres + pgvector on :5433
uv sync && uv run uvicorn agent.main:app --port 8811
```

```bash
curl -X POST localhost:8811/index -H 'content-type: application/json' \
  -d '{"repo_path": "/path/to/repo", "repo_id": "repo@commit"}'
curl -X POST localhost:8811/query -H 'content-type: application/json' \
  -d '{"repo_id": "repo@commit", "question": "Where are retries configured?", "strategy": "hybrid"}'
```

Embeddings run locally by default (`jinaai/jina-embeddings-v2-base-code` via fastembed); set `EMBEDDING_PROVIDER=gemini` to use `gemini-embedding-001`. Tests: `uv run pytest`, lint: `uv run ruff check .`
