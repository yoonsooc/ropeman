# ropeman-agent

Answers questions about a Python repository from its tree-sitter skeleton (symbols, signatures, docstrings, imports; function bodies are not indexed), and compares retrieval strategies: BM25, vector (pgvector), and hybrid (RRF).

```bash
cp .env.example .env            # set ANTHROPIC_API_KEY
docker compose up -d --wait     # Postgres + pgvector on :5433
uv sync && uv run uvicorn agent.main:app --port 8811
```

```bash
curl -X POST localhost:8811/index -H 'content-type: application/json' \
  -d '{"repo_path": ".data/repos/requests", "repo_id": "requests@46e939b"}'
curl -X POST localhost:8811/query -H 'content-type: application/json' \
  -d '{"repo_id": "requests@46e939b", "question": "Where are retries configured?", "strategy": "hybrid"}'
```

`/index` only accepts directories under `REPOS_ROOT` (default `.data/repos`), because their structure is sent to the LLM at query time. Answers cite retrieved chunks by number; the service maps each number back to a file and symbol, so a citation cannot point at code that was not retrieved.

Embeddings run locally by default (`jinaai/jina-embeddings-v2-base-code` via fastembed); set `EMBEDDING_PROVIDER=gemini` to use `gemini-embedding-001`. Tests: `uv run pytest`, lint: `uv run ruff check .`

## Retrieval results (W1)

SWE-QA questions for requests and flask (95 scored), file-level gold, local embeddings. Details, failure cases and limits: [`eval/reports/W1.md`](eval/reports/W1.md).

| strategy     | Recall@5 | Hit@5 | MRR@10 |
| ------------ | -------- | ----- | ------ |
| BM25         | 0.685    | 0.916 | 0.806  |
| vector       | 0.683    | 0.958 | 0.882  |
| hybrid (RRF) | 0.661    | 0.916 | 0.862  |

Recall@5 differences are within noise (all 95% paired-bootstrap intervals include 0). Vector and hybrid rank the first relevant file higher than BM25 (MRR intervals exclude 0). Hybrid did not beat vector alone.
