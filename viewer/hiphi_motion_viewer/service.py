"""Authenticated lifecycle records for locally running viewer instances."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

STOP_TOKEN_HEADER = "X-HiPHI-Stop-Token"  # noqa: S105 - protocol header name, not a credential
STATE_DIRECTORY_ENV = "HIPHI_VIEWER_STATE_DIR"


def register_service(port: int, token: str) -> None:
    """Atomically records the token needed to stop one local viewer."""
    state_file = service_state_file(port)
    state_file.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        state_file.parent.chmod(0o700)
    except OSError:
        pass
    temporary = state_file.with_name(f".{state_file.name}.{os.getpid()}.tmp")
    payload = {"version": 1, "pid": os.getpid(), "port": port, "token": token}
    try:
        temporary.write_text(json.dumps(payload), encoding="utf-8")
        try:
            temporary.chmod(0o600)
        except OSError:
            pass
        os.replace(temporary, state_file)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def unregister_service(port: int, token: str) -> None:
    """Removes only the record belonging to this exact viewer instance."""
    state_file = service_state_file(port)
    record = _read_record(state_file)
    if record and record.get("token") == token:
        try:
            state_file.unlink()
        except FileNotFoundError:
            pass


def stop_registered_service(port: int) -> int:
    """Requests shutdown from the authenticated viewer registered on ``port``."""
    state_file = service_state_file(port)
    record = _read_record(state_file)
    if record is None:
        print(f"Nothing is registered on port {port} - the viewer is not running.")
        return 0
    token = record.get("token")
    if record.get("port") != port or not isinstance(token, str):
        print(f"Refusing to use an invalid viewer service record for port {port}.")
        return 1

    request = Request(
        f"http://127.0.0.1:{port}/api/stop",
        data=b"",
        method="POST",
        headers={STOP_TOKEN_HEADER: token},
    )
    direct_opener = build_opener(ProxyHandler({}))
    try:
        with direct_opener.open(request, timeout=2) as response:
            payload = json.loads(response.read() or b"{}")
            if response.status != 200 or payload.get("ok") is not True:
                print(f"Viewer on port {port} did not accept the stop request.")
                return 1
    except HTTPError as exc:
        print(f"Refusing to stop port {port}: the listener is not the registered HiPHI Motion Viewer ({exc.code}).")
        return 1
    except URLError as exc:
        if isinstance(exc.reason, ConnectionRefusedError):
            unregister_service(port, token)
            print(f"Nothing is listening on port {port} - removed a stale viewer record.")
            return 0
        print(f"Registered viewer on port {port} did not answer the stop request: {exc.reason}")
        return 1
    except (OSError, ValueError) as exc:
        print(f"Registered viewer on port {port} returned an invalid stop response: {exc}")
        return 1

    deadline = time.monotonic() + 5
    while state_file.exists() and time.monotonic() < deadline:
        time.sleep(0.05)
    if state_file.exists():
        print(f"Viewer on port {port} accepted the request but did not stop in time.")
        return 1
    print("Viewer stopped.")
    return 0


def service_state_file(port: int) -> Path:
    if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
        raise ValueError(f"Invalid port: {port}")
    configured = os.environ.get(STATE_DIRECTORY_ENV)
    directory = Path(configured).expanduser() if configured else Path.home() / ".hiphi_motion_viewer_services"
    return directory / f"{port}.json"


def _read_record(state_file: Path) -> dict[str, object] | None:
    try:
        payload = json.loads(state_file.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else None
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        return {}
