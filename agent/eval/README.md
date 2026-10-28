# eval

Retrieval evaluation for `agent/`.

| file            | what                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `swe_qa.py`     | builds `goldset.jsonl` from SWE-QA (needs `.data/swe-qa/*.jsonl` and the repos in `.data/repos/`)     |
| `goldset.jsonl` | 96 questions with expected files resolved at the pinned commits                                       |
| `run.py`        | runs BM25, vector and hybrid retrieval, prints Recall@5, Hit@5, MRR@10 and paired bootstrap intervals |
| `results/`      | per-question output of the last run                                                                   |
| `reports/`      | write-ups (`W1.md`)                                                                                   |

Setup, from `agent/`:

```bash
mkdir -p .data/swe-qa .data/repos
B=https://raw.githubusercontent.com/peng-weihan/SWE-QA-Bench/c13deac7a0d99b0ca2e593e004c4739475785b08
curl -sfL -o .data/swe-qa/requests.jsonl $B/Benchmark/requests.jsonl
curl -sfL -o .data/swe-qa/flask.jsonl $B/Benchmark/flask.jsonl
git clone https://github.com/psf/requests .data/repos/requests && git -C .data/repos/requests checkout 46e939b
git clone https://github.com/pallets/flask .data/repos/flask && git -C .data/repos/flask checkout 85c5d93
uv run python -m eval.swe_qa && uv run python -m eval.run
```

## Data license

`goldset.jsonl` contains questions and reference answers from
[SWE-QA-Bench](https://github.com/peng-weihan/SWE-QA-Bench) (commit `c13deac`),
licensed under the Apache License 2.0. The `expected`, `unresolved`, `id`, `repo_id` and
`commit` fields were added here; question and answer text is unchanged.
