#!/bin/sh
# Serve the reproduction on http://127.0.0.1:8877/
cd "$(dirname "$0")" || exit 1
exec python3 -m http.server "${1:-8877}"
