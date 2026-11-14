from agent.llm import AnswerDraft, build_user_prompt, resolve_citations
from agent.models import Chunk, SearchHit


def _hits() -> list[SearchHit]:
    return [
        SearchHit(
            chunk=Chunk(
                id=f"c{i}",
                repo_id="r",
                path=f"f{i}.py",
                symbol=f"s{i}",
                kind="function",
                text=f"text {i}",
            ),
            score=1.0,
            rank=i,
        )
        for i in (1, 2)
    ]


def test_maps_numbers_to_chunks_dedupes_and_flags_out_of_range():
    # Arrange
    draft = AnswerDraft(answer="x", cited_chunks=[2, 2, 0, 3, 1])

    # Act
    citations, invalid = resolve_citations(draft, _hits())

    # Assert
    assert [(c.path, c.symbol) for c in citations] == [("f2.py", "s2"), ("f1.py", "s1")]
    assert invalid == [0, 3]


def test_prompt_numbers_excerpts_from_one():
    prompt = build_user_prompt("q?", _hits())

    assert "[1]\ntext 1" in prompt and "[2]\ntext 2" in prompt and prompt.endswith("Question: q?")
