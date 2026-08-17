"""Command-line stop helper used by the platform launchers."""

from __future__ import annotations

import argparse

from .service import stop_registered_service


def valid_port(raw: str) -> int:
    try:
        port = int(raw)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid port: {raw}") from exc
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError(f"invalid port: {raw}")
    return port


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Stop a running HiPHI Motion Viewer.")
    parser.add_argument("port", nargs="?", default=8666, type=valid_port)
    args = parser.parse_args(argv)
    return stop_registered_service(args.port)


if __name__ == "__main__":
    raise SystemExit(main())
