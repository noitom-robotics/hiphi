#!/usr/bin/env bash
# Double-click to stop a running HiPHI Motion Viewer (macOS), or run from a
# terminal on Linux.
#
# Pass a port number to stop a viewer started with --port, e.g.
#     ./stop-viewer.command 9000

PORT="${1:-8666}"

if command -v lsof >/dev/null 2>&1; then
    PIDS=$(lsof -ti "tcp:$PORT" 2>/dev/null)
elif command -v fuser >/dev/null 2>&1; then
    PIDS=$(fuser "$PORT/tcp" 2>/dev/null)
else
    echo "Need lsof or fuser to find the viewer process."
    exit 1
fi

if [ -z "$PIDS" ]; then
    echo "Nothing is listening on port $PORT - the viewer is not running."
else
    echo "Stopping process(es): $PIDS"
    # SIGTERM first so the server closes its socket cleanly.
    kill $PIDS 2>/dev/null
    sleep 1
    kill -9 $PIDS 2>/dev/null
    echo "Viewer stopped."
fi
