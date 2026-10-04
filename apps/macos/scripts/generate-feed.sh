#!/bin/bash
set -euo pipefail
studio_dir="$(cd "$(dirname "$0")/.." && pwd)"
tag="${STUDIO_TAG:-}"
[[ "$tag" =~ ^studio-v[0-9]+\.[0-9]+\.[0-9]+([.-][a-zA-Z0-9.-]+)?$ ]] || { echo 'Set STUDIO_TAG to a separate desktop release tag (studio-v…).' >&2; exit 1; }
tools="$studio_dir/.build/artifacts/sparkle/Sparkle/bin"
app="$studio_dir/dist/RasanAI Studio.app"
key="$("$tools/generate_keys" --account rasanai-studio -p)"
embedded="$(/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$app/Contents/Info.plist")"
[[ "$key" = "$embedded" ]] || { echo 'Keychain signing identity does not match the embedded update public key.' >&2; exit 1; }
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")"
build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app/Contents/Info.plist")"
archive="$studio_dir/dist/RasanAI-Studio-$version-$build-arm64-unnotarized.dmg"
[[ -f "$archive" ]] || { echo 'Package the current app build first.' >&2; exit 1; }
# Curate one desktop release, never advertise old/unuploaded archives in dist.
release_dir="$studio_dir/dist/releases/$tag"
mkdir -p "$release_dir"
destination="$release_dir/$(basename "$archive")"
if [[ -e "$destination" ]]; then
    cmp -s "$archive" "$destination" || { echo 'Refusing to replace a staged immutable release archive.' >&2; exit 1; }
else
    cp "$archive" "$destination"
fi
for staged in "$release_dir"/*.dmg; do
    [[ "$staged" = "$destination" ]] || { echo 'Unexpected archive in release staging; use a new tag.' >&2; exit 1; }
done
"$tools/generate_appcast" --account rasanai-studio --maximum-deltas 0 \
    --download-url-prefix "https://github.com/Sibhimanyu/rasanai/releases/download/$tag/" \
    --link 'https://sibhimanyu.github.io/rasanai/#mac' "$release_dir"
echo "Release feed: $release_dir/appcast.xml"
echo 'Generated signed archive metadata. Do not publish the feed until the matching release assets are public and a real upgrade has passed.'
