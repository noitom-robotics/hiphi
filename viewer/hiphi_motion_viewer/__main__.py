"""Command-line entry point for the HiPHI Motion Viewer."""

from __future__ import annotations

import argparse
import secrets
import sys
import threading
import webbrowser
from pathlib import Path

from .server import Source, load_recent_path, make_server, resolve_source, save_recent_path
from .service import register_service, unregister_service


def server_port(raw: str) -> int:
    try:
        port = int(raw)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid port: {raw}") from exc
    if not 0 <= port <= 65535:
        raise argparse.ArgumentTypeError(f"invalid port: {raw}")
    return port


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="hiphi-motion-viewer",
        description="View HiPHI motion capture data in your browser. Runs entirely offline.",
    )
    parser.add_argument(
        "path",
        nargs="?",
        help="Extracted HiPHI dataset folder, or a single .bvh file. "
        "Defaults to the current directory; you can also set it in the viewer.",
    )
    parser.add_argument("--port", type=server_port, default=8666, help="Port to listen on (default: 8666).")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser window.")
    return parser


def choose_source(path_arg: str | None) -> tuple[Source | None, str]:
    """Picks what to serve, in priority order.

    An explicit path wins. Otherwise the last folder opened is reused, which is
    what lets a double-click launch land somewhere useful. Failing both, the
    current directory is served and the user sets the path in the viewer.

    Args:
        path_arg: The command-line path, if one was given.

    Returns:
        ``(source, note)``. ``source`` is None only when an explicit path was
        given and could not be resolved, in which case ``note`` is the error.
    """
    if path_arg:
        try:
            source = resolve_source(path_arg)
        except ValueError as exc:
            return None, str(exc)
        save_recent_path(source.path)
        return source, ""

    recent = load_recent_path()
    if recent:
        try:
            return resolve_source(recent), f"reopened last folder ({recent})"
        except ValueError:
            # The folder moved or was deleted since last time; fall through
            # rather than refusing to start.
            pass

    return Source(root=Path.cwd().resolve()), (
        "no path given - set one in the box at the top of the page"
    )


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    source, note = choose_source(args.path)
    if source is None:
        print(f"error: {note}", file=sys.stderr)
        return 1

    stop_token = secrets.token_urlsafe(32)
    try:
        server = make_server(source, args.port, stop_token=stop_token)
    except OSError as exc:
        print(f"error: could not listen on port {args.port}: {exc}", file=sys.stderr)
        print("Try a different port with --port.", file=sys.stderr)
        return 1

    actual_port = int(server.server_address[1])
    try:
        register_service(actual_port, stop_token)
    except OSError as exc:
        server.server_close()
        print(f"error: could not register the local stop service: {exc}", file=sys.stderr)
        return 1

    url = f"http://127.0.0.1:{actual_port}/"
    print("HiPHI Motion Viewer")
    print(f"  serving: {source.root}")
    if source.single_file:
        print(f"  file:    {source.single_file}")
    if note:
        print(f"  note:    {note}")
    print(f"  open:    {url}")
    print("  press Ctrl+C to stop")

    if not args.no_browser:
        # Delay so the browser's first request lands after serve_forever starts.
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        server.server_close()
        unregister_service(actual_port, stop_token)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
