from eval.metrics import hit_at_k, paired_bootstrap, recall_at_k, reciprocal_rank
from eval.swe_qa import build, mentioned_paths, resolve

FILES = {"src/requests/sessions.py", "src/requests/models.py", "tests/test_requests.py"}


def test_mentioned_paths_keeps_first_mention_order_and_strips_dot_slash():
    answer = "See `./src/a.py` (lines 3-9), then b.py, /src/c.py and src/a.py again. Not a.pyc."

    assert mentioned_paths(answer) == ["src/a.py", "b.py", "src/c.py"]


def test_resolve_accepts_exact_or_unique_suffix_only():
    assert resolve("src/requests/sessions.py", FILES) == "src/requests/sessions.py"
    assert resolve("sessions.py", FILES) == "src/requests/sessions.py"
    assert resolve("requests/models.py", FILES) == "src/requests/models.py"
    assert resolve("missing.py", FILES) is None


def test_resolve_rejects_ambiguous_suffix():
    files = {"src/flask/app.py", "examples/tutorial/app.py"}

    assert resolve("app.py", files) is None


def test_build_dedupes_resolved_paths_and_keeps_unresolved():
    rows = [
        {"question": "q", "answer": "In sessions.py and src/requests/sessions.py; also gone.py"}
    ]

    [item] = build("requests", "46e939b", rows, FILES)

    assert item["id"] == "requests-01" and item["repo_id"] == "requests@46e939b"
    assert item["expected"] == [{"path": "src/requests/sessions.py"}]
    assert item["unresolved"] == ["gone.py"]


def test_file_level_metrics():
    ranked = ["a.py", "a.py", "x.py", "b.py", "y.py", "c.py"]
    expected = {"b.py", "c.py"}

    assert recall_at_k(ranked, expected, 5) == 0.5
    assert hit_at_k(ranked, expected, 5) == 1.0
    assert reciprocal_rank(ranked, expected) == 0.25
    assert reciprocal_rank(["x.py"], expected) == 0.0


def test_paired_bootstrap_is_deterministic_and_brackets_the_mean():
    a, b = [1.0, 1.0, 0.0, 1.0] * 10, [0.0, 1.0, 0.0, 0.0] * 10

    first = paired_bootstrap(a, b, resamples=2000, seed=1)
    again = paired_bootstrap(a, b, resamples=2000, seed=1)

    diff, low, high = first
    assert first == again
    assert low <= diff <= high and diff == 0.5
