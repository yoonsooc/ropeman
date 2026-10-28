"""Repository path -> SkeletonPayload (symbols, signatures, docstrings, imports).

Only structure is extracted; function bodies are never stored.
"""

import os
from datetime import UTC, datetime
from pathlib import Path

import tree_sitter_python as tspython
from tree_sitter import Language, Node, Parser

from agent.errors import InvalidRepoPathError
from agent.models import SkeletonFile, SkeletonImport, SkeletonPayload, SkeletonSymbol

PY_LANGUAGE = Language(tspython.language())

SKIP_DIRS = {
    ".git",
    ".hg",
    ".tox",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "__pycache__",
    "build",
    "dist",
    ".mypy_cache",
    ".pytest_cache",
}
MAX_DOCSTRING_CHARS = 1000


def _text(node: Node, source: bytes) -> str:
    return source[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _header(node: Node, source: bytes) -> str:
    """`def f(a, b) -> int` / `class C(Base)` without the body or trailing colon."""
    body = node.child_by_field_name("body")
    end = body.start_byte if body is not None else node.end_byte
    header = source[node.start_byte : end].decode("utf-8", errors="replace").strip()
    return " ".join(header.removesuffix(":").split())


def _docstring(node: Node, source: bytes) -> str | None:
    body = node.child_by_field_name("body")
    if body is None or not body.named_children:
        return None
    first = body.named_children[0]
    if first.type != "expression_statement" or not first.named_children:
        return None
    string = first.named_children[0]
    if string.type != "string":
        return None
    content = "".join(
        _text(child, source) for child in string.named_children if child.type == "string_content"
    )
    content = " ".join(content.split())
    return content[:MAX_DOCSTRING_CHARS] or None


def _unwrap(node: Node, source: bytes) -> tuple[Node, list[str]]:
    """Return the definition inside a decorated_definition plus its decorator names."""
    if node.type != "decorated_definition":
        return node, []
    badges = [
        "@" + _text(child, source).lstrip("@").split("(")[0].strip()
        for child in node.named_children
        if child.type == "decorator"
    ]
    definition = node.child_by_field_name("definition")
    return (definition if definition is not None else node), badges


def _symbol(node: Node, source: bytes, kind: str, badges: list[str]) -> SkeletonSymbol:
    name_node = node.child_by_field_name("name")
    header = _header(node, source)
    if header.startswith("async "):
        badges = [*badges, "async"]
    return SkeletonSymbol(
        name=_text(name_node, source) if name_node else "<anonymous>",
        kind=kind,
        badges=badges,
        signature=header,
        docstring=_docstring(node, source),
        line=node.start_point[0] + 1,
    )


def _class_symbol(node: Node, source: bytes, badges: list[str]) -> SkeletonSymbol:
    symbol = _symbol(node, source, "class", badges)
    body = node.child_by_field_name("body")
    for child in body.named_children if body is not None else []:
        definition, child_badges = _unwrap(child, source)
        if definition.type == "function_definition":
            symbol.children.append(_symbol(definition, source, "method", child_badges))
    return symbol


def _imports(node: Node, source: bytes) -> SkeletonImport | list[SkeletonImport]:
    if node.type == "import_statement":
        sources = []
        for child in node.named_children:
            target = child.child_by_field_name("name") if child.type == "aliased_import" else child
            sources.append(SkeletonImport(source=_text(target, source)))
        return sources
    module = node.child_by_field_name("module_name")
    specifiers = []
    for name in node.children_by_field_name("name"):
        target = name.child_by_field_name("name") if name.type == "aliased_import" else name
        specifiers.append(_text(target, source))
    if any(child.type == "wildcard_import" for child in node.named_children):
        specifiers.append("*")
    return SkeletonImport(source=_text(module, source) if module else "", specifiers=specifiers)


def parse_python(path: str, source: bytes) -> SkeletonFile:
    tree = Parser(PY_LANGUAGE).parse(source)
    file = SkeletonFile(path=path, language="python")
    for top in tree.root_node.named_children:
        if top.type in ("import_statement", "import_from_statement"):
            found = _imports(top, source)
            file.imports.extend(found if isinstance(found, list) else [found])
            continue
        definition, badges = _unwrap(top, source)
        if definition.type == "function_definition":
            file.symbols.append(_symbol(definition, source, "function", badges))
        elif definition.type == "class_definition":
            file.symbols.append(_class_symbol(definition, source, badges))
    return file


def _python_files(root: Path, max_files: int, max_file_bytes: int) -> list[Path]:
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune in place so skipped trees (.venv, node_modules) are never walked.
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith("."))
        for name in sorted(filenames):
            if not name.endswith(".py"):
                continue
            path = Path(dirpath) / name
            try:
                if path.stat().st_size > max_file_bytes:
                    continue
            except OSError:
                continue
            files.append(path)
            if len(files) >= max_files:
                return files
    return files


def _read(path: Path) -> bytes | None:
    try:
        return path.read_bytes()
    except OSError:
        return None


def extract_skeleton(
    repo_path: str | Path, project_name: str, max_files: int = 2000, max_file_bytes: int = 500_000
) -> SkeletonPayload:
    root = Path(repo_path).resolve()
    if not root.is_dir():
        raise InvalidRepoPathError(f"not a directory: {root}")
    files = []
    for path in _python_files(root, max_files, max_file_bytes):
        source = _read(path)
        if source is not None:
            files.append(parse_python(path.relative_to(root).as_posix(), source))
    total_symbols = sum(len(f.symbols) + sum(len(s.children) for s in f.symbols) for f in files)
    return SkeletonPayload(
        project_name=project_name,
        total_files=len(files),
        total_symbols=total_symbols,
        files=files,
        generated_at=datetime.now(UTC).isoformat(),
    )
