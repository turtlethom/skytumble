#!/usr/bin/env bash
# Play every optimal solution for levels matching an id prefix in headless Chrome, end to end:
#   npm run verify -- wind-          (or wind-06, or nothing for every handmade level)
# Builds, serves dist/ on a spare port, plays each solution with real key events, reports WON/NOT WON
# at par, saves start/end screenshots to $SHOTS (default /tmp/skytumble-shots), and stops the server.
set -euo pipefail
cd "$(dirname "$0")/../.."
prefix="${1:-}"
port="${PORT:-4179}"
shots="${SHOTS:-/tmp/skytumble-shots}"
work="$(mktemp -d)"
if curl -sf "http://localhost:$port/" > /dev/null; then
  echo "Port $port is already serving something: stop it or set PORT=..." >&2
  exit 1
fi
npm run build --silent > "$work/build.log" 2>&1 || { cat "$work/build.log"; exit 1; }
node_modules/.bin/vite preview --port "$port" --strictPort > "$work/preview.log" 2>&1 &
server=$!
trap 'kill $server 2>/dev/null; rm -rf "$work"' EXIT
up=""
for _ in $(seq 50); do curl -sf "http://localhost:$port/" > /dev/null && up=1 && break; sleep 0.2; done
[ -n "$up" ] || { echo "The preview server didn't start:" >&2; cat "$work/preview.log" >&2; exit 1; }
npx vite-node scripts/design/solutions.ts "$prefix" > "$work/solutions.json"
LAYERS=1 npx vite-node scripts/design/solutions.ts "$prefix" > "$work/solutions.layers.json"
mkdir -p "$shots"
node scripts/design/play.mjs "http://localhost:$port" "$work/solutions.json" "$shots"
echo "screenshots: $shots"
