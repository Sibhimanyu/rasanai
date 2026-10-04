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
mountpoint="$staging/mount"
mounted=0
cleanup() {
    if [[ "$mounted" = 1 ]]; then
        hdiutil detach "$mountpoint" >/dev/null || { echo "Could not detach packaging image; leaving $staging intact." >&2; return; }
    fi
    if [[ -d "$staging" ]]; then /bin/rm -r "$staging"; fi
}
trap cleanup EXIT
# Avoid macOS's image-from-folder copy helper, which can stall on Node headers.
# Use a blank image and tar, preserving bundle links, permissions and signatures
# without BOMCopier's per-file temporary renames.
size_kb="$(du -sk "$app" | awk '{print $1}')"
size_kb=$((size_kb + size_kb / 4 + 65536))
hdiutil create -size "${size_kb}k" -fs HFS+ -volname 'RasanAI Studio' -nospotlight "$staging/writable.dmg" >/dev/null
mkdir "$mountpoint"
# Treat even a failed/partial attach as potentially mounted; cleanup must detach
# successfully before removing any staging path.
mounted=1
hdiutil attach "$staging/writable.dmg" -nobrowse -mountpoint "$mountpoint" >/dev/null
tar -cf - -C "$studio_dir/dist" 'RasanAI Studio.app' | tar -xf - -C "$mountpoint"
ln -s /Applications "$mountpoint/Applications"
cp "$studio_dir/COMMUNITY-INSTALL.md" "$mountpoint/READ ME - Unnotarized.md"
codesign --verify --deep --strict "$mountpoint/RasanAI Studio.app"
hdiutil detach "$mountpoint" >/dev/null
mounted=0
hdiutil convert "$staging/writable.dmg" -format UDZO -o "$target" >/dev/null
hdiutil verify "$target" >/dev/null
(cd "$studio_dir/dist" && shasum -a 256 "$(basename "$target")") > "$target.sha256"
echo "$target"
