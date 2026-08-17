#!/usr/bin/env bash
# Double-click to start the HiPHI Motion Viewer (macOS), or run it from a
# terminal on Linux. Pass a folder or .bvh path as an argument to open it
# directly.
#
# On macOS the first run may need: chmod +x "Start Viewer (Mac-Linux).command"

cd "$(dirname "$0")" || exit 1

if command -v python3 >/dev/null 2>&1; then
    PYTHON=python3
elif command -v python >/dev/null 2>&1; then
    PYTHON=python
else
    echo
    echo "Python was not found on this computer."
    echo "Install Python 3.9 or newer from https://www.python.org/downloads/"
    echo
    read -r -p "Press Return to close."
    exit 1
fi

# "$@" forwards a dropped path as well as any options such as --port.
"$PYTHON" -m hiphi_motion_viewer "$@"
