#!/usr/bin/env bash
set -e

# Initial production build so the plugin loads immediately when Grafana starts.
# npm run dev will overwrite this with a dev build shortly after.
npm run build

# Webpack watch — rebuilds frontend on source changes (branch switches, edits)
npm run dev &
DEV_PID=$!

trap 'kill $DEV_PID 2>/dev/null; wait $DEV_PID 2>/dev/null' EXIT INT TERM

# Docker compose with DEVELOPMENT=true for backend hot-reload via supervisord
DEVELOPMENT=true docker compose up --build
