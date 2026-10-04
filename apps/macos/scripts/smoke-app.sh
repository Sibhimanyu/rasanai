#!/bin/bash
# Provider-free startup regression: launch a relocated bundle, never a build-tree
# executable. The public build 7 DMG exits 133 here with a resource lookup trap.
set -euo pipefail
[[ $# = 1 && -d "$1/Contents" ]] || { echo 'Usage: bash smoke-app.sh /path/to/app.app' >&2; exit 1; }
studio_dir="$(cd "$(dirname "$0")/.." && pwd)"
probe="$(mktemp -d "$studio_dir/../../.context/app-smoke.XXXXXX")"
app="$probe/RasanAI Studio.app"
ditto "$1" "$app"
codesign --verify --deep --strict "$app"
"$app/Contents/MacOS/RasanAIStudio" -projectRoot "$probe/library" \
    -reopenLastProject NO -hasCompletedWelcome YES > "$probe/launch.log" 2>&1 &
pid=$!
cleanup() { if kill -0 "$pid" 2>/dev/null; then kill -TERM "$pid"; wait "$pid" 2>/dev/null || true; fi; }
trap cleanup EXIT
for ((i=0; i<15; i++)); do
    sleep 1
    if ! kill -0 "$pid" 2>/dev/null; then
        status=0; wait "$pid" || status=$?
        echo "Startup failed (exit $status). Diagnostic: $probe/launch.log" >&2
        exit 1
    fi
done
echo "Startup passed: relocated bundle stayed running for 15 seconds. Diagnostic: $probe/launch.log"
