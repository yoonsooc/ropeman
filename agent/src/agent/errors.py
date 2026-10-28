"""Errors the API maps to specific HTTP status codes (see main.py)."""


class InvalidRepoPathError(Exception):
    """The repo path is missing, not a directory, or outside the allowed root. -> 400"""


class UnknownRepoError(KeyError):
    """No index exists for this repo id. -> 404"""


class RefusalError(RuntimeError):
    """The model declined to answer. -> 422"""


class InvalidAnswerError(RuntimeError):
    """The model returned no parseable answer (e.g. hit max_tokens). -> 502"""


class UpstreamError(RuntimeError):
    """The LLM provider call failed. -> 502"""
