#!/bin/bash
# npm run mac-app: builds Imagination.app, a double-clickable Mac app for this checkout. Drag it to the Dock.
# Opening it starts the studio in the background when it isn't running, then opens it in your browser.
# Hold Option while opening it to stop the studio.
#
#   scripts/make-mac-app.sh [--dest DIR] [--repo PATH] [--dry-run]
#     --dest DIR   where Imagination.app goes (default ~/Applications)
#     --repo PATH  the app folder it starts (default: the checkout this script is in)
#     --dry-run    print what it would build, change nothing
#
# Only tools that come with macOS: osacompile, sips, iconutil, plutil, codesign.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
DEST="$HOME/Applications"
DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dest) DEST="${2:?--dest needs a folder}"; shift 2 ;;
    --repo) REPO="${2:?--repo needs a folder}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "make-mac-app: unknown option $1 (try --help)" >&2; exit 2 ;;
  esac
done

[ "$(uname -s)" = Darwin ] || { echo "The Imagination app launcher is for macOS only." >&2; exit 2; }
[ -d "$REPO" ] && REPO="$(cd "$REPO" && pwd)"
[ -f "$REPO/scripts/setup.mjs" ] || { echo "make-mac-app: $REPO isn't an Imagination app folder (no scripts/setup.mjs)." >&2; exit 2; }
APP="$DEST/Imagination.app"
VERSION="$(sed -n 's/^  "version": "\([^"]*\)".*/\1/p' "$REPO/package.json" | head -n 1)"

echo "Building $APP"
echo "  starts:  $REPO"
echo "  version: ${VERSION:-1.0.0}"
[ "$DRY" = 1 ] && { echo "Dry run: nothing written."; exit 0; }

mkdir -p "$DEST"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

# the app: a compiled AppleScript applet (a real Dock app with native dialogs) around launch.sh
osacompile -o "$WORK/Imagination.app" "$HERE/mac-app/Imagination.applescript"
RES="$WORK/Imagination.app/Contents/Resources"
cp "$HERE/mac-app/launch.sh" "$RES/launch.sh"; chmod 755 "$RES/launch.sh"
printf '%s\n' "$REPO" > "$RES/repo-path"

# icon: the brand tile at every size macOS asks for
ICONSET="$WORK/Imagination.iconset"; mkdir "$ICONSET"
for s in 16 32 128 256 512; do
  sips -s format png -z "$s" "$s" "$REPO/brand/app-icon-512.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2)); [ "$d" -le 512 ] && sips -s format png -z "$d" "$d" "$REPO/brand/app-icon-512.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
rm -f "$RES/applet.icns" "$RES/Assets.car"
iconutil -c icns "$ICONSET" -o "$RES/Imagination.icns"

PLIST="$WORK/Imagination.app/Contents/Info.plist"
plutil -replace CFBundleName -string Imagination "$PLIST"
plutil -replace CFBundleDisplayName -string Imagination "$PLIST"
plutil -replace CFBundleIdentifier -string app.iiayn.launcher "$PLIST"
plutil -replace CFBundleIconFile -string Imagination "$PLIST"
plutil -remove CFBundleIconName "$PLIST" 2>/dev/null || true
plutil -replace CFBundleShortVersionString -string "${VERSION:-1.0.0}" "$PLIST"
plutil -replace CFBundleVersion -string "${VERSION:-1.0.0}" "$PLIST"
plutil -replace LSMinimumSystemVersion -string 11.0 "$PLIST"
for k in NSAppleEventsUsageDescription NSAppleMusicUsageDescription NSCalendarsUsageDescription NSCameraUsageDescription NSContactsUsageDescription NSHomeKitUsageDescription NSMicrophoneUsageDescription NSPhotoLibraryUsageDescription NSRemindersUsageDescription NSSiriUsageDescription NSSystemAdministrationUsageDescription; do
  plutil -remove "$k" "$PLIST" 2>/dev/null || true # the launcher needs none of these
done
plutil -replace NSHumanReadableCopyright -string "Imagination Is All You Need. AGPL-3.0-or-later." "$PLIST"

# sign it again (ad hoc) after the changes, so macOS sees one consistent app
codesign --force --sign - "$WORK/Imagination.app" >/dev/null 2>&1 || echo "  (couldn't re-sign; the app still opens on this Mac)"

rm -rf "$APP"
mv "$WORK/Imagination.app" "$APP"
touch "$APP" # Finder and the Dock pick up the new icon
echo "Done. Open it from $DEST, or drag Imagination to the Dock."
echo "Hold Option while opening it to stop Imagination."
