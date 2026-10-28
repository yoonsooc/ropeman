"""Code-aware tokenizer for BM25.

`refreshAccessToken` and `refresh_access_token` both yield `refresh`, `access`, `token`,
plus the whole identifier so an exact-name query still ranks its definition first.
"""

import re

_IDENTIFIER = re.compile(r"[^\W\d][\w]*")
_WORD = re.compile(r"[^\W_]+")
_CAMEL_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")

STOPWORDS = frozenset(
    "a an and are as at be by do does for from how in is it its of on or that the this "
    "to what when where which who why with".split()
)


def tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    for identifier in _IDENTIFIER.findall(text):
        parts = [
            part.lower()
            for word in _WORD.findall(identifier)
            for part in _CAMEL_BOUNDARY.split(word)
            if part
        ]
        tokens.extend(part for part in parts if part not in STOPWORDS)
        if len(parts) > 1:
            tokens.append(identifier.lower())
    return tokens
