#!/bin/bash
set -euo pipefail
studio_dir="$(cd "$(dirname "$0")/.." && pwd)"
app="$studio_dir/dist/RasanAI Studio.app"
[[ -d "$app" ]] || { echo 'Build the app first' >&2; exit 1; }
codesign --verify --deep --strict "$app"
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")"
build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app/Contents/Info.plist")"
target="$studio_dir/dist/RasanAI-Studio-$version-$build-arm64-unnotarized.dmg"
[[ ! -e "$target" ]] || { echo 'Refusing to overwrite an existing release archive; increment the build number.' >&2; exit 1; }
staging="$(mktemp -d "$studio_dir/dmg-stage.XXXXXX")"
trap 'if [[ -d "$staging" ]]; then /bin/rm -r "$staging"; fi' EXIT
ditto "$app" "$staging/RasanAI Studio.app"
ln -s /Applications "$staging/Applications"
cp "$studio_dir/COMMUNITY-INSTALL.md" "$staging/READ ME - Unnotarized.md"
# HFS+ avoids APFS image-creation stalls while preserving app symlinks and signatures.
hdiutil create -volname 'RasanAI Studio' -srcfolder "$staging" -format UDZO -fs HFS+ "$target" >/dev/null
hdiutil verify "$target" >/dev/null
(cd "$studio_dir/dist" && shasum -a 256 "$(basename "$target")") > "$target.sha256"
echo "$target"
