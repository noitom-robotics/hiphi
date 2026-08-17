#!/usr/bin/env python3
"""Validate the static HiPHI project page before publishing."""
from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_TEXT_PATHS = [
    *sorted(ROOT.glob("*.html")),
    ROOT / "README.md",
    ROOT / "TODO_ASSETS.md",
    ROOT / "static" / "css",
    ROOT / "static" / "js",
    ROOT / "static" / "data",
    ROOT / "static" / "interactive",
]
REFERENCE_ATTRS = {"src", "href", "poster", "data-src"}
IGNORED_SCHEMES = {"http", "https", "mailto", "tel"}
BLOCKED_SCHEMES = {"javascript", "data", "file"}
FORBIDDEN_REGEXES = [
    ("local absolute path", re.compile(r"/(?:home|mnt|Users|private|var/folders|tmp)/[A-Za-z0-9_.\-/]+|/data_[A-Za-z0-9_.\-/]+")),
    ("windows absolute path", re.compile(r"[A-Za-z]:\\\\")),
    ("private IPv4 address", re.compile(r"\b(?:10|172\.(?:1[6-9]|2\d|3[0-1])|192\.168)\.[0-9]{1,3}\.[0-9]{1,3}(?:\.[0-9]{1,3})?\b")),
    ("credential-looking password assignment", re.compile(r"(?i)(?:password|passwd|pwd)\s*[:=]\s*[\'\"]?[^\s,;\'\"]+")),
    ("ssh credential hint", re.compile(r"ssh\s+[^\n]*@")),
]
MAX_ASSET_BYTES = 100 * 1024 * 1024
WARN_ASSET_BYTES = 25 * 1024 * 1024


class RefParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.refs: list[tuple[str, str, str]] = []
        self.stat_keys: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {key: value for key, value in attrs}
        for key, value in attrs:
            if key in REFERENCE_ATTRS and value:
                self.refs.append((tag, key, value))
        stat_key = attr_map.get("data-stat-key")
        if stat_key:
            self.stat_keys.append(stat_key)


def iter_text_files(path: Path):
    if not path.exists():
        return
    if path.is_file():
        yield path
        return
    for child in path.rglob("*"):
        if child.is_file() and child.suffix.lower() in {".html", ".css", ".js", ".json", ".md", ".svg", ".txt"}:
            yield child


def url_parts(value: str):
    value = value.strip()
    if not value or value.startswith("#"):
        return None
    return urlsplit(value)


def local_ref_target(value: str, base_dir: Path) -> Path | None:
    parts = url_parts(value)
    if parts is None:
        return None
    if parts.scheme in IGNORED_SCHEMES or parts.netloc or parts.scheme in BLOCKED_SCHEMES:
        return None
    raw_path = parts.path
    if not raw_path:
        return None
    if raw_path.startswith("/"):
        return ROOT / raw_path.lstrip("/")
    return (base_dir / raw_path).resolve()


def check_url_scheme(value: str, source: Path, errors: list[str]) -> None:
    parts = url_parts(value)
    if parts is not None and parts.scheme in BLOCKED_SCHEMES:
        errors.append(f"blocked URL scheme in {source.relative_to(ROOT)}: {value!r}")


def html_files() -> list[Path]:
    return sorted([*ROOT.glob("*.html"), *((ROOT / "static" / "interactive").glob("*.html"))])


def check_html_refs(errors: list[str]) -> None:
    for html in html_files():
        parser = RefParser()
        parser.feed(html.read_text(encoding="utf-8"))
        for tag, key, value in parser.refs:
            check_url_scheme(value, html, errors)
            target = local_ref_target(value, html.parent)
            if target and not target.exists():
                shown = target.relative_to(ROOT) if target.is_relative_to(ROOT) else target
                errors.append(f"missing local reference in {html.relative_to(ROOT)}: <{tag} {key}={value!r}> -> {shown}")


def check_stat_bindings(errors: list[str]) -> None:
    stats_path = ROOT / "static" / "data" / "site_stats.json"
    try:
        stats = json.loads(stats_path.read_text(encoding="utf-8"))["stats"]
    except Exception as exc:
        errors.append(f"cannot load stats source of truth: {stats_path.relative_to(ROOT)}: {exc}")
        return
    for html in sorted(ROOT.glob("*.html")):
        parser = RefParser()
        parser.feed(html.read_text(encoding="utf-8"))
        missing = sorted({key for key in parser.stat_keys if key not in stats})
        if missing:
            errors.append(f"{html.relative_to(ROOT)} has data-stat-key values missing from site_stats.json: {missing}")


def iter_json_asset_refs(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in {"media", "poster", "image", "src", "href", "thumbnail"} and isinstance(item, str):
                yield item
            yield from iter_json_asset_refs(item)
    elif isinstance(value, list):
        for item in value:
            yield from iter_json_asset_refs(item)


def check_json(errors: list[str]) -> None:
    for path in sorted((ROOT / "static" / "data").glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # pragma: no cover - CLI report path
            errors.append(f"invalid JSON: {path.relative_to(ROOT)}: {exc}")
            continue
        for ref in iter_json_asset_refs(data):
            check_url_scheme(ref, path, errors)
            target = local_ref_target(ref, path.parent)
            if target and not target.exists():
                shown = target.relative_to(ROOT) if target.is_relative_to(ROOT) else target
                errors.append(f"missing JSON asset reference in {path.relative_to(ROOT)}: {ref!r} -> {shown}")


def check_forbidden_text(errors: list[str]) -> None:
    for base in PUBLIC_TEXT_PATHS:
        for path in iter_text_files(base) or []:
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError as exc:
                errors.append(f"cannot read {path.relative_to(ROOT)}: {exc}")
                continue
            for label, pattern in FORBIDDEN_REGEXES:
                if pattern.search(text):
                    errors.append(f"forbidden {label}: {path.relative_to(ROOT)}")


def check_asset_sizes(warnings: list[str], errors: list[str]) -> None:
    for path in sorted((ROOT / "static").rglob("*")):
        if not path.is_file():
            continue
        size = path.stat().st_size
        rel = path.relative_to(ROOT)
        if size > MAX_ASSET_BYTES:
            errors.append(f"asset exceeds 100 MiB GitHub hard limit: {rel} ({size / 1024 / 1024:.1f} MiB)")
        elif size > WARN_ASSET_BYTES:
            warnings.append(f"large asset: {rel} ({size / 1024 / 1024:.1f} MiB)")


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    check_html_refs(errors)
    check_stat_bindings(errors)
    check_json(errors)
    check_forbidden_text(errors)
    check_asset_sizes(warnings, errors)

    for warning in warnings:
        print(f"WARN: {warning}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"FAILED: {len(errors)} error(s), {len(warnings)} warning(s)", file=sys.stderr)
        return 1
    print(f"OK: static site assets validated ({len(warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
