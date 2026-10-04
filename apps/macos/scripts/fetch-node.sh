#!/bin/bash
set -euo pipefail
studio_dir="$(cd "$(dirname "$0")/.." && pwd)"
filename=node-v22.23.3-darwin-arm64.tar.gz
checksum=23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53
cache="$studio_dir/.build/node-runtime"
mkdir -p "$cache"
if [[ ! -f "$cache/$filename" ]]; then
    curl --fail --location --proto '=https' --tlsv1.2 --max-time 300 "https://nodejs.org/dist/v22.23.3/$filename" -o "$cache/$filename"
fi
actual="$(shasum -a 256 "$cache/$filename" | awk '{print $1}')"
[[ "$actual" = "$checksum" ]] || { echo 'Node checksum failed' >&2; exit 1; }
# Always extract a fresh runtime from the verified archive, not a mutable cached executable tree.
runtime_dir="$(mktemp -d "$cache/runtime.XXXXXX")"
tar -xzf "$cache/$filename" -C "$runtime_dir"
echo "$runtime_dir/node-v22.23.3-darwin-arm64"
