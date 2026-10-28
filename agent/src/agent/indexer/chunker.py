"""SkeletonPayload -> symbol-level chunks (one per function, class and method).

Files without symbols get a single module chunk so every file stays retrievable.
"""

from agent.models import Chunk, SkeletonFile, SkeletonPayload, SkeletonSymbol

MAX_IMPORTS_IN_CHUNK = 15


def _imports_line(file: SkeletonFile) -> str:
    sources = []
    for imp in file.imports:
        if not imp.specifiers:
            sources.append(imp.source)
            continue
        # "from . import x" has source ".", which must not become "..x"
        sep = "" if imp.source.endswith(".") else "."
        sources.append(f"{imp.source}{sep}{','.join(imp.specifiers)}")
    return ", ".join(sources[:MAX_IMPORTS_IN_CHUNK])


def _render(file: SkeletonFile, qualname: str, symbol: SkeletonSymbol, extra: list[str]) -> str:
    lines = [f"file: {file.path}", f"symbol: {qualname} ({symbol.kind})"]
    if symbol.signature:
        lines.append(f"signature: {symbol.signature}")
    if symbol.badges:
        lines.append(f"badges: {' '.join(symbol.badges)}")
    if symbol.docstring:
        lines.append(f"doc: {symbol.docstring}")
    lines.extend(extra)
    imports = _imports_line(file)
    if imports:
        lines.append(f"imports: {imports}")
    return "\n".join(lines)


def _chunk(repo_id: str, file: SkeletonFile, qualname: str, symbol: SkeletonSymbol, text: str):
    return Chunk(
        id=f"{file.path}::{qualname}@{symbol.line}",
        repo_id=repo_id,
        path=file.path,
        symbol=qualname,
        kind=symbol.kind,
        text=text,
    )


def chunk_file(repo_id: str, file: SkeletonFile) -> list[Chunk]:
    chunks = []
    for symbol in file.symbols:
        extra = []
        if symbol.children:
            extra.append("methods: " + ", ".join(child.name for child in symbol.children))
        chunks.append(
            _chunk(repo_id, file, symbol.name, symbol, _render(file, symbol.name, symbol, extra))
        )
        for method in symbol.children:
            qualname = f"{symbol.name}.{method.name}"
            chunks.append(
                _chunk(repo_id, file, qualname, method, _render(file, qualname, method, []))
            )
    if not chunks:
        imports = _imports_line(file)
        lines = [f"file: {file.path}", "symbol: <module> (module)"]
        if imports:
            lines.append(f"imports: {imports}")
        chunks.append(
            Chunk(
                id=f"{file.path}::<module>@1",
                repo_id=repo_id,
                path=file.path,
                symbol="<module>",
                kind="module",
                text="\n".join(lines),
            )
        )
    return chunks


def chunk_payload(repo_id: str, payload: SkeletonPayload) -> list[Chunk]:
    return [chunk for file in payload.files for chunk in chunk_file(repo_id, file)]
