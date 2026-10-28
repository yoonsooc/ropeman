import pytest
from fastapi.testclient import TestClient

from agent.errors import InvalidAnswerError, RefusalError, UpstreamError
from agent.main import create_app


@pytest.fixture
def client(service):
    return TestClient(create_app(service))


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_index_then_query_returns_answer_with_verified_citations(client, sample_repo, answerer):
    # Arrange
    indexed = client.post("/index", json={"repo_path": str(sample_repo), "repo_id": "sample"})

    # Act
    response = client.post(
        "/query", json={"repo_id": "sample", "question": "refresh_session lifetime", "k": 3}
    )

    # Assert
    assert indexed.status_code == 200
    assert indexed.json() == {"repo_id": "sample", "files": 4, "symbols": 6, "chunks": 7}
    body = response.json()
    assert response.status_code == 200
    assert body["strategy"] == "hybrid"
    assert len(body["hits"]) == 3
    first = body["hits"][0]["chunk"]
    assert body["citations"] == [{"path": first["path"], "symbol": first["symbol"]}]
    assert body["invalid_citations"] == [99]
    assert len(answerer.calls[0][1]) == 3


@pytest.mark.parametrize("strategy", ["bm25", "vector", "hybrid"])
def test_each_strategy_finds_the_named_function(client, sample_repo, strategy):
    client.post("/index", json={"repo_path": str(sample_repo), "repo_id": "sample"})

    response = client.post(
        "/query",
        json={"repo_id": "sample", "question": "render_chart bar chart", "strategy": strategy},
    )

    assert response.json()["hits"][0]["chunk"]["symbol"] == "render_chart"


def test_query_unknown_repo_is_404(client):
    response = client.post("/query", json={"repo_id": "missing", "question": "x"})

    assert response.status_code == 404


def test_query_without_hits_skips_the_llm(client, sample_repo, answerer):
    client.post("/index", json={"repo_path": str(sample_repo), "repo_id": "sample"})

    response = client.post(
        "/query", json={"repo_id": "sample", "question": "zzz qqq", "strategy": "bm25"}
    )

    assert response.json()["hits"] == [] and answerer.calls == []


def test_rejects_unknown_strategy_and_bad_path(client, tmp_path):
    bad_strategy = client.post("/query", json={"repo_id": "s", "question": "x", "strategy": "grep"})
    bad_path = client.post("/index", json={"repo_path": str(tmp_path / "nope"), "repo_id": "s"})

    assert bad_strategy.status_code == 422
    assert bad_path.status_code == 400


def test_index_rejects_paths_outside_the_repos_root(client, sample_repo):
    # Regression (review 2026-10-26-01): any host directory could be indexed and sent to the LLM
    response = client.post("/index", json={"repo_path": str(sample_repo.parent), "repo_id": "s"})

    assert response.status_code == 400
    assert "must be under" in response.json()["detail"]


@pytest.mark.parametrize(
    ("error", "status"),
    [(RefusalError("no"), 422), (InvalidAnswerError("empty"), 502), (UpstreamError("down"), 502)],
)
def test_llm_failures_map_to_http_errors(client, sample_repo, answerer, error, status):
    # Regression (review 2026-10-26-01): these surfaced as bare 500s
    client.post("/index", json={"repo_path": str(sample_repo), "repo_id": "sample"})

    def fail(question, hits):
        raise error

    answerer.answer = fail

    response = client.post("/query", json={"repo_id": "sample", "question": "render_chart"})

    assert response.status_code == status


def test_reindex_replaces_chunks_and_bm25(client, sample_repo):
    client.post("/index", json={"repo_path": str(sample_repo), "repo_id": "sample"})
    (sample_repo / "pkg" / "render.py").write_text('def draw_pie(data):\n    """Pie."""\n')

    client.post("/index", json={"repo_path": str(sample_repo), "repo_id": "sample"})
    response = client.post(
        "/query", json={"repo_id": "sample", "question": "render_chart", "strategy": "bm25"}
    )

    symbols = [hit["chunk"]["symbol"] for hit in response.json()["hits"]]
    assert "render_chart" not in symbols


def test_bm25_is_rebuilt_from_the_store_after_restart(service, sample_repo):
    service.index_repo(str(sample_repo), "sample")
    service._bm25.clear()  # simulate a fresh process with an existing index

    hits = service.retrieve("sample", "render_chart", "bm25", k=3)

    assert hits[0].chunk.symbol == "render_chart"
