import hashlib
from pathlib import Path

import pytest

from agent.llm import AnswerDraft
from agent.models import SearchHit
from agent.retrieval.tokenize import tokenize
from agent.retrieval.vector import InMemoryVectorStore
from agent.service import AgentService

SAMPLE_REPO = {
    "pkg/__init__.py": "from .session import Session\n__version__ = '1.0'\n",
    "pkg/session.py": '''import time
from .config import SESSION_TTL, retry as retry_policy


class Session:
    """Holds a logged-in user's state."""

    def __init__(self, user_id):
        self.user_id = user_id

    @property
    def is_expired(self) -> bool:
        """Check whether the session lifetime has passed."""
        return False


async def refresh_session(session: Session) -> None:
    """Extend the session lifetime."""
''',
    "pkg/config.py": "SESSION_TTL = 1800\n\ndef retry(times: int = 3):\n    pass\n",
    "pkg/render.py": 'def render_chart(data):\n    """Draw a bar chart."""\n',
    "pkg/.hidden/skip.py": "def hidden():\n    pass\n",
}


@pytest.fixture
def sample_repo(tmp_path: Path) -> Path:
    for rel, content in SAMPLE_REPO.items():
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    return tmp_path


class HashEmbedder:
    """Deterministic bag-of-tokens embedding: texts sharing tokens are close."""

    model = "hash-test"
    dim = 64

    def _vector(self, text: str) -> list[float]:
        vector = [0.0] * self.dim
        for token in tokenize(text):
            vector[int(hashlib.md5(token.encode()).hexdigest(), 16) % self.dim] += 1.0
        return vector

    def embed_documents(self, texts):
        return [self._vector(text) for text in texts]

    def embed_query(self, text):
        return self._vector(text)


class CitingAnswerer:
    """Cites the first hit plus an out-of-range number, to exercise citation checks."""

    model = "fake"

    def __init__(self):
        self.calls: list[tuple[str, list[SearchHit]]] = []

    def answer(self, question, hits):
        self.calls.append((question, hits))
        return AnswerDraft(answer=f"answer to: {question}", cited_chunks=[1, 1, 99])


@pytest.fixture
def answerer() -> CitingAnswerer:
    return CitingAnswerer()


@pytest.fixture
def service(answerer, sample_repo) -> AgentService:
    return AgentService(
        store=InMemoryVectorStore(),
        embedder=HashEmbedder(),
        answerer=answerer,
        repos_root=sample_repo,
    )
