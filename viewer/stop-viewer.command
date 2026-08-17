#!/usr/bin/env bash
# Double-click to stop a running HiPHI Motion Viewer (macOS), or run from a
# terminal on Linux.
#
# Pass a port number to stop a viewer started with --port, e.g.
#     ./stop-viewer.command 9000

cd "$(dirname "$0")" || exit 1

PORT="${1:-8666}"

if command -v python3 >/dev/null 2>&1; then
    PYTHON=python3
elif command -v python >/dev/null 2>&1; then
    PYTHON=python
else
    echo "Python was not found on this computer."
    exit 1
fi

"$PYTHON" -m hiphi_motion_viewer.stop "$PORT"
