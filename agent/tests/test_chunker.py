from agent.indexer.chunker import chunk_payload
from agent.indexer.skeleton import extract_skeleton


def test_one_chunk_per_symbol_plus_module_chunk_for_symbol_less_files(sample_repo):
    # Arrange
    payload = extract_skeleton(sample_repo, "sample")

    # Act
    chunks = chunk_payload("sample", payload)

    # Assert
    symbols = [(c.path, c.symbol, c.kind) for c in chunks]
    assert ("pkg/__init__.py", "<module>", "module") in symbols
    assert ("pkg/session.py", "Session.is_expired", "method") in symbols
    assert ("pkg/session.py", "refresh_session", "function") in symbols
    assert len({c.id for c in chunks}) == len(chunks)


def test_chunk_text_carries_signature_doc_and_imports(sample_repo):
    chunks = chunk_payload("sample", extract_skeleton(sample_repo, "sample"))

    text = next(c.text for c in chunks if c.symbol == "Session.is_expired")

    assert "file: pkg/session.py" in text
    assert "signature: def is_expired(self) -> bool" in text
    assert "doc: Check whether the session lifetime has passed." in text
    assert "imports: time, .config.SESSION_TTL,retry" in text


def test_class_chunk_lists_its_methods(sample_repo):
    chunks = chunk_payload("sample", extract_skeleton(sample_repo, "sample"))

    text = next(c.text for c in chunks if c.symbol == "Session")

    assert "methods: __init__, is_expired" in text


def test_relative_import_from_package_is_not_doubled():
    # Regression (review 2026-10-26-01): "from . import x" rendered as "..x"
    from agent.indexer.chunker import _imports_line
    from agent.models import SkeletonFile, SkeletonImport

    file = SkeletonFile(
        path="pkg/a.py",
        language="python",
        symbols=[],
        imports=[SkeletonImport(source=".", specifiers=["x"]), SkeletonImport(source="os")],
    )

    assert _imports_line(file) == ".x, os"
