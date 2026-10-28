from agent.indexer.skeleton import extract_skeleton, parse_python


def test_extracts_symbols_signatures_docstrings_and_imports(sample_repo):
    # Arrange
    source = (sample_repo / "pkg/session.py").read_bytes()

    # Act
    file = parse_python("pkg/session.py", source)

    # Assert
    assert [s.name for s in file.symbols] == ["Session", "refresh_session"]
    session, refresh = file.symbols
    assert session.kind == "class" and session.docstring == "Holds a logged-in user's state."
    assert [m.name for m in session.children] == ["__init__", "is_expired"]
    is_expired = session.children[1]
    assert is_expired.kind == "method"
    assert is_expired.signature == "def is_expired(self) -> bool"
    assert is_expired.badges == ["@property"]
    assert refresh.signature == "async def refresh_session(session: Session) -> None"
    assert "async" in refresh.badges
    assert [(i.source, i.specifiers) for i in file.imports] == [
        ("time", []),
        (".config", ["SESSION_TTL", "retry"]),
    ]


def test_function_bodies_are_not_stored(sample_repo):
    file = parse_python("pkg/session.py", (sample_repo / "pkg/session.py").read_bytes())

    dumped = file.model_dump_json()

    assert "return False" not in dumped and "self.user_id = user_id" not in dumped


def test_walks_repo_skipping_hidden_dirs_and_serialises_camel_case(sample_repo):
    payload = extract_skeleton(sample_repo, "sample")

    paths = [f.path for f in payload.files]
    assert paths == ["pkg/__init__.py", "pkg/config.py", "pkg/render.py", "pkg/session.py"]
    assert payload.total_symbols == 6  # retry, render_chart, Session(+2 methods), refresh_session
    dumped = payload.model_dump(by_alias=True)
    assert {"projectName", "totalFiles", "totalSymbols", "generatedAt"} <= dumped.keys()


def test_skips_files_over_size_limit(sample_repo):
    payload = extract_skeleton(sample_repo, "sample", max_file_bytes=60)

    assert "pkg/session.py" not in [f.path for f in payload.files]


def test_rejects_missing_directory(tmp_path):
    import pytest

    from agent.errors import InvalidRepoPathError

    with pytest.raises(InvalidRepoPathError):
        extract_skeleton(tmp_path / "nope", "x")


def test_skips_vendored_trees_and_unreadable_files(tmp_path):
    (tmp_path / "app.py").write_text("def main():\n    pass\n")
    (tmp_path / "node_modules" / "x").mkdir(parents=True)
    (tmp_path / "node_modules" / "x" / "v.py").write_text("def vendored():\n    pass\n")
    locked = tmp_path / "locked.py"
    locked.write_text("def secret():\n    pass\n")
    locked.chmod(0)

    try:
        payload = extract_skeleton(tmp_path, "x")
    finally:
        locked.chmod(0o644)

    assert [f.path for f in payload.files] == ["app.py"]
