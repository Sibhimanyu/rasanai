#!/bin/bash
# Build the drag-to-install DMG.
#
# Deliberately avoids `hdiutil create -srcfolder` (and create-dmg/appdmg, which use it):
# endpoint security such as CrowdStrike holds the volume and fails it with "Resource busy".
# Instead: empty HFS+ image -> mount -> ditto the app in -> Finder lays the window out ->
# detach -> compress to UDZO -> verify. Window layout must match Packaging/make-background.py.
#
# STUDIO_DMG_OUT=/path/file.dmg builds a test image there (an existing file is replaced).
set -euo pipefail
studio_dir="$(cd "$(dirname "$0")/.." && pwd)"
app_name='RasanAI Studio'
volname='RasanAI Studio'
app="$studio_dir/dist/$app_name.app"
bg_tiff="$studio_dir/Packaging/background.tiff"
[[ -d "$app" ]] || { echo 'Build the app first' >&2; exit 1; }
[[ -f "$bg_tiff" ]] || { echo "Missing $bg_tiff; run Packaging/make-background.py" >&2; exit 1; }
codesign --verify --deep --strict "$app"
plist="$app/Contents/Info.plist"
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")"
executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist")"
if [[ -n "${STUDIO_DMG_OUT:-}" ]]; then
    target="$STUDIO_DMG_OUT"
    mkdir -p "$(dirname "$target")"
    rm -f "$target" "$target.sha256"
else
    target="$studio_dir/dist/RasanAI-Studio-$version.dmg"
    [[ ! -e "$target" && ! -e "$target.sha256" ]] || { echo "Refusing to overwrite $(basename "$target"): that version is already packaged. Bump the version (and build number), or move the old file out of dist." >&2; exit 1; }
fi

# Window geometry (points). Icon centres match the artwork in Packaging/background.tiff.
win_w=660; win_h=420
win_left=200; win_top=120
title_bar=32   # Finder bounds include the title bar; the background is drawn for the content area
app_x=170;  app_y=205
dest_x=490; dest_y=205
icon_size=128

staging="$(mktemp -d "$studio_dir/dmg-stage.XXXXXX")"
mountpoint="$staging/$volname"  # Finder shows the mount directory name, so match the volume name
verify_mount="$staging/verify"
mounted=0
verify_mounted=0
detach() {
    local mp="$1" i
    for i in 1 2 3; do
        hdiutil detach "$mp" -force >/dev/null 2>&1 && return 0
        sleep 2
    done
    return 1
}
cleanup() {
    local failed=0
    if [[ "$verify_mounted" = 1 ]]; then detach "$verify_mount" || failed=1; fi
    if [[ "$mounted" = 1 ]]; then detach "$mountpoint" || failed=1; fi
    if [[ "$failed" = 1 ]]; then echo "Could not detach packaging image; leaving $staging intact." >&2; return; fi
    if [[ -d "$staging" ]]; then /bin/rm -r "$staging"; fi
}
trap cleanup EXIT

rw="$staging/writable.dmg"
size_mb=$(( $(du -sm "$app" | cut -f1) * 5 / 4 + 64 ))
hdiutil create -size "${size_mb}m" -fs HFS+ -volname "$volname" -type UDIF "$rw" >/dev/null
mkdir "$mountpoint" "$verify_mount"
# Treat even a failed/partial attach as potentially mounted; cleanup must detach
# successfully before removing any staging path. No -nobrowse: Finder must see the volume.
mounted=1
hdiutil attach "$rw" -noautoopen -mountpoint "$mountpoint" >/dev/null

# ditto keeps the code signature, bundle links and permissions.
ditto "$app" "$mountpoint/$app_name.app"
ln -s /Applications "$mountpoint/Applications"
codesign --verify --deep --strict "$mountpoint/$app_name.app"

mkdir "$mountpoint/.background"
cp "$bg_tiff" "$mountpoint/.background/background.tiff"
if [[ -f "$app/Contents/Resources/AppIcon.icns" ]]; then
    cp "$app/Contents/Resources/AppIcon.icns" "$mountpoint/.VolumeIcon.icns"
    SetFile -a C "$mountpoint"
fi

# Finder writes the window layout to .DS_Store. Fail-soft: without Automation permission
# (or in CI) the DMG still installs, it just opens as a plain window.
layout_ok=0
if [[ -n "${CI:-}" ]]; then
    echo "warning: CI is set; skipping Finder window layout (the DMG will open as a plain window)." >&2
else
    # perl alarm: never hang forever on a pending Automation prompt.
    if perl -e 'alarm 120; exec @ARGV' osascript >/dev/null <<OSA
tell application "Finder"
  set theDisk to (POSIX file "$mountpoint" as alias)
  open theDisk
  delay 1
  set theWindow to container window of theDisk
  set current view of theWindow to icon view
  set toolbar visible of theWindow to false
  set statusbar visible of theWindow to false
  set bounds of theWindow to {$win_left, $win_top, $((win_left + win_w)), $((win_top + win_h + title_bar))}
  set viewOptions to icon view options of theWindow
  set arrangement of viewOptions to not arranged
  set icon size of viewOptions to $icon_size
  set text size of viewOptions to 12
  set background picture of viewOptions to file ".background:background.tiff" of theDisk
  set position of item "$app_name.app" of theDisk to {$app_x, $app_y}
  set position of item "Applications" of theDisk to {$dest_x, $dest_y}
  close theWindow
  open theDisk
  update theDisk without registering applications
  delay 2
  close container window of theDisk
end tell
OSA
    then
        for _ in $(seq 1 40); do [[ -f "$mountpoint/.DS_Store" ]] && break; sleep 0.5; done
        if [[ -f "$mountpoint/.DS_Store" ]]; then layout_ok=1; fi
    fi
    if [[ "$layout_ok" != 1 ]]; then
        echo "warning: Finder window layout failed (allow your terminal under System Settings > Privacy & Security > Automation > Finder). The DMG still installs, but opens as a plain window." >&2
    fi
fi

for f in .background .VolumeIcon.icns .fseventsd .Trashes; do
    [[ -e "$mountpoint/$f" ]] && chflags hidden "$mountpoint/$f"
done
# Spotlight starts indexing a new volume at once, so detach with -force after a sync.
sync; sleep 2
detach "$mountpoint" || { echo 'Could not detach the writable image.' >&2; exit 1; }
mounted=0

hdiutil convert "$rw" -format UDZO -o "$target" >/dev/null
hdiutil verify "$target" >/dev/null
(cd "$(dirname "$target")" && shasum -a 256 "$(basename "$target")") > "$target.sha256"

# Verify the shipped image itself: signature on the mounted copy, and every
# @rpath framework the binary links must actually be bundled.
verify_mounted=1
hdiutil attach "$target" -nobrowse -noautoopen -mountpoint "$verify_mount" >/dev/null
codesign --verify --deep --strict "$verify_mount/$app_name.app"
while read -r lib; do
    name="${lib#@rpath/}"; name="${name%%/*}"
    if [[ ! -e "$verify_mount/$app_name.app/Contents/Frameworks/$name" ]]; then
        echo "Missing bundled framework for $lib" >&2; exit 1
    fi
done < <(otool -L "$verify_mount/$app_name.app/Contents/MacOS/$executable" | awk '/@rpath\//{print $1}')
detach "$verify_mount" || { echo 'Could not detach the verification mount.' >&2; exit 1; }
verify_mounted=0
echo "$target"
