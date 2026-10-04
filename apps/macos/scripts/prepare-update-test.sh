#!/bin/bash
# Isolated, loopback-only installed-app Sparkle smoke test. Never publish this feed.
set -euo pipefail
studio_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_app="$studio_dir/dist/RasanAI Studio.app"
[[ -d "$source_app" ]] || { echo 'Build a candidate first.' >&2; exit 1; }
codesign --verify --deep --strict "$source_app"
test_root="$(mktemp -d "$studio_dir/../../.context/sparkle-upgrade.XXXXXX")"
mkdir -p "$test_root/installed" "$test_root/package" "$test_root/feed" "$test_root/library"
for destination in installed package; do
    app="$test_root/$destination/RasanAI Studio.app"
    ditto "$source_app" "$app"
    plist="$app/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier com.rasanai.studio.updatetest' "$plist"
    /usr/libexec/PlistBuddy -c 'Set :RasanAIUpdatesEnabled true' "$plist"
    /usr/libexec/PlistBuddy -c 'Set :SUFeedURL http://localhost:18743/appcast.xml' "$plist"
    if [[ "$destination" = installed ]]; then build=5001; else build=5002; fi
    /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $build" "$plist"
    codesign --force --deep --sign - "$app"
    codesign --verify --deep --strict "$app"
done
hdiutil create -volname 'RasanAI Update Test' -srcfolder "$test_root/package" -format UDZO -fs APFS "$test_root/feed/test-update.dmg" >/dev/null
hdiutil verify "$test_root/feed/test-update.dmg" >/dev/null
"$studio_dir/.build/artifacts/sparkle/Sparkle/bin/generate_appcast" --account rasanai-studio --maximum-deltas 0 \
    --download-url-prefix 'http://localhost:18743/' "$test_root/feed"
echo "Test fixture: $test_root"
echo 'Serve the feed using test-update-server.mjs, then open the installed app. This HTTP feed is loopback-only, never a production configuration.'
