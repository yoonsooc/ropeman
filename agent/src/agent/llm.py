"""Retrieved chunks -> answer with citations.

The model cites chunks by their number in the prompt. Numbers are mapped back to
(path, symbol) here, so a citation can only point at a chunk that was actually retrieved.
"""

from typing import Protocol

from pydantic import BaseModel, Field

from agent.errors import InvalidAnswerError, RefusalError, UpstreamError
from agent.models import Citation, SearchHit

SYSTEM_PROMPT = (
    "You answer questions about a code repository. You are given numbered excerpts of its "
    "structure: file paths, symbol names, signatures, docstrings and imports (function bodies "
    "are not included). Answer only from these excerpts. If they are not enough to answer, say "
    "what is missing instead of guessing. List the numbers of every excerpt your answer relies "
    "on in cited_chunks."
)


class AnswerDraft(BaseModel):
    answer: str
    cited_chunks: list[int] = Field(default_factory=list)


class Answerer(Protocol):
    model: str

    def answer(self, question: str, hits: list[SearchHit]) -> AnswerDraft: ...


def build_user_prompt(question: str, hits: list[SearchHit]) -> str:
    excerpts = "\n\n".join(f"[{i}]\n{hit.chunk.text}" for i, hit in enumerate(hits, start=1))
    return f"Excerpts:\n\n{excerpts}\n\nQuestion: {question}"


def resolve_citations(
    draft: AnswerDraft, hits: list[SearchHit]
) -> tuple[list[Citation], list[int]]:
    citations: list[Citation] = []
    invalid: list[int] = []
    seen: set[int] = set()
    for number in draft.cited_chunks:
        if number in seen:
            continue
        seen.add(number)
        if 1 <= number <= len(hits):
            chunk = hits[number - 1].chunk
            citations.append(Citation(path=chunk.path, symbol=chunk.symbol))
        else:
            invalid.append(number)
    return citations, invalid


class AnthropicAnswerer:
    def __init__(self, model: str, api_key: str | None = None):
        import anthropic

        self.model = model
        # Settings reads .env without exporting it, so pass the key explicitly when set.
        self._client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()

    def answer(self, question, hits):
        import anthropic

        try:
            response = self._client.messages.parse(
                model=self.model,
                max_tokens=16000,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": build_user_prompt(question, hits)}],
                output_format=AnswerDraft,
            )
        except anthropic.APIError as error:
            raise UpstreamError(f"{type(error).__name__}") from error
        if response.stop_reason == "refusal":
            raise RefusalError(str(response.stop_details))
        if response.parsed_output is None:
            raise InvalidAnswerError(f"no parsed answer (stop_reason={response.stop_reason})")
        return response.parsed_output


class GeminiAnswerer:
    def __init__(self, model: str, api_key: str | None = None):
        from google import genai

        self.model = model
        self._client = genai.Client(api_key=api_key) if api_key else genai.Client()

    def answer(self, question, hits):
        from google.genai import errors, types
        from pydantic import ValidationError

        try:
            response = self._client.models.generate_content(
                model=self.model,
                contents=build_user_prompt(question, hits),
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_schema=AnswerDraft,
                    temperature=0,
                ),
            )
        except errors.APIError as error:
            raise UpstreamError(f"{type(error).__name__}") from error
        if isinstance(response.parsed, AnswerDraft):
            return response.parsed
        try:
            return AnswerDraft.model_validate_json(response.text or "")
        except ValidationError as error:
            raise InvalidAnswerError("no parseable answer") from error
