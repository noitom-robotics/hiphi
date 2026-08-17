"""Local HTTP server for the HiPHI Motion Viewer.

Serves two things from one origin so the browser can read both without any
cross-origin setup: the viewer's static files at ``/``, and the user's
extracted dataset at ``/dataset/``.

Everything stays on the local machine. Nothing is uploaded and no network
access is required.
"""

from __future__ import annotations

import csv
import hmac
import json
import os
import posixpath
import threading
from dataclasses import dataclass
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from .service import STOP_TOKEN_HEADER

WEB_ROOT = Path(__file__).resolve().parent.parent / "web"

# Extensions the dataset actually contains. Anything else is refused so a
# stray file in the folder cannot be served by accident.
DATASET_SUFFIXES = {".bvh", ".csv", ".json", ".obj", ".txt", ".md"}

# Remembering the last folder is what makes launching by double-click useful:
# without it every launch would start empty and need the path typed again.
RECENT_PATH_FILE = Path.home() / ".hiphi_motion_viewer.json"


def load_recent_path() -> str | None:
    """Returns the last folder opened, or None if there isn't a usable one."""
    try:
        data = json.loads(RECENT_PATH_FILE.read_text(encoding="utf-8"))
        recent = str(data.get("last_path", ""))
        return recent if recent and Path(recent).exists() else None
    except (OSError, ValueError):
        return None


def save_recent_path(path: Path) -> None:
    """Records `path` as the last folder opened. Failure is not worth reporting."""
    try:
        RECENT_PATH_FILE.write_text(json.dumps({"last_path": str(path)}), encoding="utf-8")
    except OSError:
        pass


@dataclass
class Source:
    """What the viewer was pointed at.

    Attributes:
        root: Directory served at ``/dataset/``. For a single ``.bvh`` this is
            the file's parent directory.
        single_file: File name when a single ``.bvh`` was given, else None.
    """

    root: Path
    single_file: str | None = None

    @property
    def mode(self) -> str:
        return "single" if self.single_file else "dataset"

    @property
    def path(self) -> Path:
        return self.root / self.single_file if self.single_file else self.root


class SourceState:
    """The active source, swappable at runtime by the UI's path box."""

    def __init__(self, source: Source) -> None:
        self._lock = threading.Lock()
        self._source = source
        self._tree_cache: list[dict[str, object]] | None = None
        self._generation = 0

    @property
    def source(self) -> Source:
        with self._lock:
            return self._source

    def replace(self, source: Source) -> None:
        with self._lock:
            self._source = source
            self._tree_cache = None
            self._generation += 1

    def tree(self) -> list[dict[str, object]]:
        """Motion packages present on disk, as ``{frame, lu, motionId}`` rows.

        Built by scanning ``data/{frame}/{lu}/{motion_id}/`` rather than by
        reading the release index, so a partial download lists exactly what the
        user extracted. Cached until the source changes.
        """
        while True:
            with self._lock:
                if self._tree_cache is not None:
                    return self._tree_cache
                root = self._source.root
                generation = self._generation
            rows = scan_motions(root)
            with self._lock:
                if generation != self._generation:
                    continue
                self._tree_cache = rows
                return rows


def scan_motions(root: Path) -> list[dict[str, object]]:
    """Scans ``root/data`` three levels deep for motion packages.

    A directory counts as a motion only if it contains ``motion_actor.bvh``,
    which keeps stray folders out of the list.
    """
    data_dir = root / "data"
    if not data_dir.is_dir():
        return []
    release_metadata = _read_release_metadata(root / "metadata" / "hiphi_metadata.csv")
    rows: list[dict[str, object]] = []
    for frame_entry in sorted(os.scandir(data_dir), key=lambda e: e.name):
        if not frame_entry.is_dir():
            continue
        for lu_entry in sorted(os.scandir(frame_entry.path), key=lambda e: e.name):
            if not lu_entry.is_dir():
                continue
            for motion_entry in sorted(os.scandir(lu_entry.path), key=lambda e: e.name):
                if not motion_entry.is_dir():
                    continue
                if not os.path.isfile(os.path.join(motion_entry.path, "motion_actor.bvh")):
                    continue
                row: dict[str, object] = {
                    "frame": frame_entry.name,
                    "lu": lu_entry.name,
                    "motionId": motion_entry.name,
                }
                search_metadata = release_metadata.get(motion_entry.name)
                if search_metadata is None:
                    search_metadata = _read_search_metadata(Path(motion_entry.path) / "metadata.json")
                elif search_metadata.get("isHoi"):
                    # The release index has object categories but not instance
                    # IDs. Only HOI packages need one small local read to add
                    # IDs such as "Trashbin_C_1" to catalog search.
                    local = _read_search_metadata(Path(motion_entry.path) / "metadata.json")
                    search_metadata = dict(search_metadata)
                    search_metadata["objectIds"] = local.get("objectIds", [])
                    if not search_metadata.get("objectCategories"):
                        search_metadata["objectCategories"] = local.get("objectCategories", [])
                row.update(search_metadata)
                rows.append(row)
    return rows


def _read_release_metadata(path: Path) -> dict[str, dict[str, object]]:
    """Reads the optional release index into the catalog's presentation shape."""
    try:
        with path.open(encoding="utf-8", newline="") as fh:
            rows = csv.DictReader(fh)
            result: dict[str, dict[str, object]] = {}
            for raw in rows:
                motion_id = str(raw.get("motion_id") or "")
                if not motion_id:
                    continue
                category = str(raw.get("object_categories") or "")
                result[motion_id] = {
                    "durationSec": _number(raw.get("duration_sec"), float),
                    "frameCount": _number(raw.get("frame_count"), int),
                    "actorId": str(raw.get("actor_id") or ""),
                    "textAnnotation": str(raw.get("text_annotation") or ""),
                    "isHoi": str(raw.get("is_hoi") or "").lower() == "true",
                    "mirrored": str(raw.get("mirrored") or "").lower() == "true",
                    "objectIds": [],
                    "objectCategories": [category] if category else [],
                }
            return result
    except (OSError, ValueError, csv.Error):
        return {}


def _number(value: str | None, convert: type[int] | type[float]) -> int | float:
    if value is None:
        return convert(0)
    try:
        return convert(value)
    except (TypeError, ValueError):
        return convert(0)


def _read_search_metadata(path: Path) -> dict[str, object]:
    """Reads the small semantic subset needed to search a motion catalog.

    Motion metadata is optional: a missing or malformed file never removes a
    playable BVH from the tree. The enriched tree is cached by ``SourceState``,
    avoiding one browser request per motion when the release-wide CSV is absent.
    """
    try:
        metadata = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(metadata, dict):
        return {}

    objects = metadata.get("objects")
    if not isinstance(objects, list):
        objects = []

    object_ids: list[str] = []
    object_categories: list[str] = []
    for obj in objects:
        if not isinstance(obj, dict):
            continue
        object_id = obj.get("object_id")
        category = obj.get("object_category")
        if object_id is not None and str(object_id):
            object_ids.append(str(object_id))
        if category is not None and str(category):
            object_categories.append(str(category))

    return {
        "actorId": str(metadata.get("actor_id") or ""),
        "textAnnotation": str(metadata.get("text_annotation") or ""),
        "objectIds": object_ids,
        "objectCategories": list(dict.fromkeys(object_categories)),
    }


def resolve_source(raw_path: str) -> Source:
    """Turns a user-supplied path into a Source.

    Args:
        raw_path: A dataset directory or a single ``.bvh`` file. Surrounding
            whitespace and quotes (as pasted from a file manager) are stripped.

    Returns:
        The resolved Source.

    Raises:
        ValueError: If the path does not exist or is not a usable target.
    """
    cleaned = raw_path.strip().strip('"').strip("'")
    if not cleaned:
        raise ValueError("No path given.")
    target = Path(cleaned).expanduser()
    try:
        target = target.resolve(strict=True)
    except OSError as exc:
        raise ValueError(f"Path not found: {cleaned}") from exc

    if target.is_file():
        if target.suffix.lower() != ".bvh":
            raise ValueError("A single file must be a .bvh file.")
        return Source(root=target.parent, single_file=target.name)

    if not target.is_dir():
        raise ValueError(f"Not a file or folder: {cleaned}")

    # Tolerate being pointed one level too high or too low: a folder holding a
    # single "HiPHI" directory is a common shape straight out of an extract.
    if not (target / "data").is_dir():
        nested = target / "HiPHI"
        if (nested / "data").is_dir():
            target = nested
    return Source(root=target)


class ViewerRequestHandler(SimpleHTTPRequestHandler):
    """Routes ``/api/*``, ``/dataset/*``, and the viewer's static files."""

    state: SourceState  # injected by make_server
    stop_token: str | None = None

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        # The default handler logs every asset request; a motion load is
        # hundreds of lines of noise in the terminal the user is watching.
        pass

    def do_GET(self) -> None:  # noqa: N802 - name fixed by the stdlib base class
        path = urlparse(self.path).path
        if path == "/api/config":
            source = self.state.source
            self._send_json(
                {
                    "mode": source.mode,
                    "root": str(source.path),
                    "single": {"name": source.single_file} if source.single_file else None,
                }
            )
            return
        if path == "/api/tree":
            self._send_json({"motions": self.state.tree()})
            return
        if path.startswith("/dataset/"):
            self._serve_dataset(path[len("/dataset/"):])
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802 - name fixed by the stdlib base class
        path = urlparse(self.path).path
        if path == "/api/stop":
            supplied_token = self.headers.get(STOP_TOKEN_HEADER, "")
            if not self.stop_token or not hmac.compare_digest(supplied_token, self.stop_token):
                self._send_json({"error": "Invalid stop token."}, status=403)
                return
            self._send_json({"ok": True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if path != "/api/open":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(payload, dict):
                raise ValueError
        except ValueError:
            self._send_json({"error": "Malformed request."}, status=400)
            return
        try:
            source = resolve_source(str(payload.get("path", "")))
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=400)
            return
        self.state.replace(source)
        save_recent_path(source.path)
        print(f"  now serving: {source.root}")
        self._send_json({"ok": True})

    def _serve_dataset(self, rel_path: str) -> None:
        root = self.state.source.root
        rel = unquote(rel_path)
        # posixpath.normpath collapses "..", and the resolved-prefix check
        # below catches symlinks that would otherwise escape the root.
        normalized = posixpath.normpath(rel).lstrip("/")
        if normalized.startswith(".."):
            self.send_error(403, "Path outside the dataset folder")
            return
        target = (root / normalized).resolve()
        try:
            target.relative_to(root.resolve())
        except ValueError:
            self.send_error(403, "Path outside the dataset folder")
            return
        if not target.is_file():
            self.send_error(404, "Not found")
            return
        if target.suffix.lower() not in DATASET_SUFFIXES:
            self.send_error(403, "File type not served")
            return

        ctype = {
            ".json": "application/json",
            ".csv": "text/csv; charset=utf-8",
        }.get(target.suffix.lower(), "text/plain; charset=utf-8")

        try:
            size = target.stat().st_size
            with open(target, "rb") as fh:
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(size))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self._copy_stream(fh)
        except BrokenPipeError:
            # Selecting another motion mid-load aborts the fetch; expected.
            pass
        except OSError:
            self.send_error(500, "Could not read file")

    def _copy_stream(self, fh) -> None:
        while True:
            chunk = fh.read(1 << 16)
            if not chunk:
                break
            self.wfile.write(chunk)

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def make_server(source: Source, port: int, stop_token: str | None = None) -> ThreadingHTTPServer:
    """Builds the HTTP server bound to localhost only.

    Args:
        source: The dataset or single file to serve.
        port: TCP port; 0 picks a free one.
        stop_token: Secret required by the local stop endpoint, or None to disable it.

    Returns:
        An unstarted ThreadingHTTPServer.
    """
    state = SourceState(source)
    handler = type(
        "BoundViewerHandler",
        (ViewerRequestHandler,),
        {"state": state, "stop_token": stop_token},
    )
    # 127.0.0.1 rather than 0.0.0.0: the dataset is the user's local data and
    # should not be reachable from the rest of the network.
    return ThreadingHTTPServer(("127.0.0.1", port), handler)
