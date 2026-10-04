#!/bin/bash
set -euo pipefail
studio_dir="$(cd "$(dirname "$0")/.." && pwd)"
[[ -n "${STUDIO_BUILD:-}" ]] || { echo 'Set a new positive STUDIO_BUILD number.' >&2; exit 1; }
export STUDIO_NODE_RUNTIME="$(bash "$studio_dir/scripts/fetch-node.sh")"
# Updates are opt-in for a candidate until the actual feed/release has been tested and published.
bash "$studio_dir/scripts/build-app.sh" release
bash "$studio_dir/scripts/package-dmg.sh"
