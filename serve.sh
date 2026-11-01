#!/usr/bin/env bash
# ES modules + fetch need a real origin — file:// will not work.
cd "$(dirname "$0")"
PORT="${1:-8080}"
echo "http://localhost:$PORT"
python3 -m http.server "$PORT"
