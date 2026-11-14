from agent.indexer.chunker import chunk_payload
from agent.indexer.skeleton import extract_skeleton
from agent.models import Chunk, SearchHit
from agent.retrieval.bm25 import BM25Retriever
from agent.retrieval.hybrid import rrf
from agent.retrieval.vector import table_name


def _hit(chunk_id: str, rank: int) -> SearchHit:
    chunk = Chunk(
        id=chunk_id, repo_id="r", path=f"{chunk_id}.py", symbol=chunk_id, kind="function", text=""
    )
    return SearchHit(chunk=chunk, score=0.0, rank=rank)


def test_bm25_ranks_exact_identifier_definition_first(sample_repo):
    # Arrange
    retriever = BM25Retriever(chunk_payload("s", extract_skeleton(sample_repo, "s")))

    # Act
    hits = retriever.search("where is refresh_session defined", k=3)

    # Assert
    assert hits[0].chunk.symbol == "refresh_session"
    assert [h.rank for h in hits] == list(range(1, len(hits) + 1))


def test_bm25_returns_nothing_without_term_overlap(sample_repo):
    retriever = BM25Retriever(chunk_payload("s", extract_skeleton(sample_repo, "s")))

    assert retriever.search("로그인이 풀리는 원인", k=5) == []


def test_rrf_prefers_documents_both_rankers_agree_on():
    # Arrange: A is 1st and 3rd, C is 4th and 2nd, B is only in one ranking
    bm25 = [_hit("A", 1), _hit("X", 2), _hit("Y", 3), _hit("C", 4)]
    vector = [_hit("B", 1), _hit("C", 2), _hit("A", 3)]

    # Act
    fused = rrf([bm25, vector], k=60)

    # Assert
    assert [h.chunk.id for h in fused][:3] == ["A", "C", "B"]
    assert abs(fused[0].score - (1 / 61 + 1 / 63)) < 1e-12


def test_rrf_limit_and_reranking():
    fused = rrf([[_hit("A", 1), _hit("B", 2)], [_hit("B", 1)]], limit=1)

    assert [(h.chunk.id, h.rank) for h in fused] == [("B", 1)]


def test_vector_tables_differ_per_model_even_with_same_dimension():
    # Regression: tables were keyed by dimension only, so two 768-dim models shared one.
    local = table_name("jinaai/jina-embeddings-v2-base-code", 768)
    gemini = table_name("gemini-embedding-001", 768)

    assert local != gemini
    assert local == "chunks_jinaai_jina_embeddings_v2_base_code_d768"
    assert len(table_name("x" * 100, 768)) <= 63


def test_long_model_names_keep_dimension_and_stay_distinct():
    # Regression (review 2026-10-26-01): [:63] truncation dropped "_d{dim}" and merged names
    base = "organisation/" + "very-long-embedding-model-name-" * 2

    a, b = table_name(base + "a", 768), table_name(base + "b", 768)
    c = table_name(base + "a", 1024)

    assert len({a, b, c}) == 3
    assert all(len(name) <= 63 for name in (a, b, c))
    assert a.endswith("_d768") and c.endswith("_d1024")


def test_rrf_breaks_ties_by_first_seen_order():
    fused = rrf([[_hit("A", 1)], [_hit("B", 1)]], k=60)

    assert [hit.chunk.id for hit in fused] == ["A", "B"]
