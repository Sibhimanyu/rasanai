#!/bin/bash
set -euo pipefail

studio_dir="$(cd "$(dirname "$0")/.." && pwd)"
configuration="${1:-debug}"
if [[ "$configuration" != "debug" && "$configuration" != "release" ]]; then
    echo "Usage: bash scripts/build-app.sh [debug|release]" >&2
    exit 1
fi

cd "$studio_dir"
swift build -c "$configuration"
binary_dir="$(swift build -c "$configuration" --show-bin-path)"
app_path="$studio_dir/dist/RasanAI Studio.app"
staging="$(mktemp -d "$studio_dir/dist-build.XXXXXX")"
trap 'if [[ -d "$staging" ]]; then /bin/rm -r "$staging"; fi' EXIT
bundle="$staging/RasanAI Studio.app"
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources" "$bundle/Contents/Frameworks"
cp "$binary_dir/RasanAIStudio" "$bundle/Contents/MacOS/RasanAIStudio"
cp "$studio_dir/Info.plist" "$bundle/Contents/Info.plist"
ditto "$binary_dir/RasanAIStudio_RasanAIStudio.bundle" "$bundle/Contents/Resources/RasanAIStudio_RasanAIStudio.bundle"
sparkle="$studio_dir/.build/artifacts/sparkle/Sparkle/Sparkle.xcframework/macos-arm64_x86_64/Sparkle.framework"
ditto "$sparkle" "$bundle/Contents/Frameworks/Sparkle.framework"
ditto "$studio_dir/../../skills/rasanai" "$bundle/Contents/Resources/Engine/rasanai"
ditto "$studio_dir/Runtime" "$bundle/Contents/Resources/Runtime"
cp "$studio_dir/../../LICENSE" "$bundle/Contents/Resources/LICENSE"
cp "$studio_dir/.build/checkouts/Sparkle/LICENSE" "$bundle/Contents/Resources/Sparkle-LICENSE"
if [[ -n "${STUDIO_NODE_RUNTIME:-}" ]]; then
    [[ -x "$STUDIO_NODE_RUNTIME/bin/node" && -f "$STUDIO_NODE_RUNTIME/LICENSE" ]] || { echo 'Invalid Node distribution' >&2; exit 1; }
    ditto "$STUDIO_NODE_RUNTIME" "$bundle/Contents/Resources/Runtime/node"
fi
plist="$bundle/Contents/Info.plist"
if [[ -n "${STUDIO_VERSION:-}" ]]; then
    [[ "$STUDIO_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Version must be major.minor.patch' >&2; exit 1; }
    /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $STUDIO_VERSION" "$plist"
fi
if [[ -n "${STUDIO_BUILD:-}" ]]; then
    [[ "$STUDIO_BUILD" =~ ^[1-9][0-9]*$ ]] || { echo 'Build must be a positive integer' >&2; exit 1; }
    /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $STUDIO_BUILD" "$plist"
fi
if [[ -n "${STUDIO_PUBLIC_KEY:-}" ]]; then
    [[ "$STUDIO_PUBLIC_KEY" =~ ^[A-Za-z0-9+/]{43}=$ ]] || { echo 'Invalid EdDSA public key encoding' >&2; exit 1; }
    /usr/libexec/PlistBuddy -c "Set :SUPublicEDKey $STUDIO_PUBLIC_KEY" "$plist"
fi
if [[ "${STUDIO_ENABLE_UPDATES:-0}" = 1 ]]; then /usr/libexec/PlistBuddy -c 'Set :RasanAIUpdatesEnabled true' "$plist"; fi
if [[ -n "${STUDIO_FEED_URL:-}" ]]; then
    [[ "$STUDIO_FEED_URL" = https://* ]] || { echo 'Update feed must use HTTPS' >&2; exit 1; }
    /usr/libexec/PlistBuddy -c "Set :SUFeedURL $STUDIO_FEED_URL" "$plist"
fi

# Generate standard macOS icon sizes from the project's existing mark.
icon_work="$staging/icon-work"
mkdir -p "$icon_work/AppIcon.iconset"
icon_source="$studio_dir/../../docs/assets/logo/rasanai-mark-1024.png"
for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$icon_source" --out "$icon_work/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null
    retina_size=$((size * 2))
    sips -z "$retina_size" "$retina_size" "$icon_source" --out "$icon_work/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$icon_work/AppIcon.iconset" -o "$bundle/Contents/Resources/AppIcon.icns"
codesign --force --deep --sign - "$bundle"
codesign --verify --deep --strict "$bundle"
mkdir -p "$studio_dir/dist"
if [[ -e "$app_path" ]]; then mv "$app_path" "$studio_dir/dist/previous-build-$(date +%s).app"; fi
mv "$bundle" "$app_path"
echo "$app_path"
