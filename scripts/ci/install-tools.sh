#!/usr/bin/env bash
# CI only: install ffmpeg/ffprobe (and optionally test tools) quickly and without hanging.
# Ubuntu's package mirror stalled CI for 15-40 min many times on 6 Nov 2026, so ffmpeg comes from a pinned static build
# on GitHub's release storage first (seconds, or from the actions/cache copy), with apt as a time-limited fallback.
# Usage: install-tools.sh [--test-tools]
# FFMPEG_CACHE_DIR: where the pinned archive is kept between runs (the workflows cache this folder with actions/cache,
# keyed on this file's hash, so changing the pin below starts a fresh cache).
set -euo pipefail

# Pinned ffmpeg 8.1 static build (GPL: includes libx264, as the tests' media encodes expect), from BtbN/FFmpeg-Builds.
# Month-end auto-builds stay published for over a year; dailies are deleted after about two weeks, so pin a month-end one.
# The checksums were computed from the downloaded files on 2026-11-06 and match the digests GitHub shows for the assets.
#   https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-31-12-59/ffmpeg-n8.1.3-27-g8dca1586f4-linux64-gpl-8.1.tar.xz
#     sha256 41e9c565594c390622cf968d82fa4135d9e9a11d06c1515644288cbc844e3380
#   https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-31-12-59/ffmpeg-n8.1.3-27-g8dca1586f4-linuxarm64-gpl-8.1.tar.xz
#     sha256 a08c0ee6e1c4e02139344b303002dcc7c37cf125d639f1fbd15dabee40fcb525
FFMPEG_TAG=autobuild-2026-10-31-12-59
FFMPEG_BUILD=ffmpeg-n8.1.3-27-g8dca1586f4
FFMPEG_SHA256_linux64=41e9c565594c390622cf968d82fa4135d9e9a11d06c1515644288cbc844e3380
FFMPEG_SHA256_linuxarm64=a08c0ee6e1c4e02139344b303002dcc7c37cf125d639f1fbd15dabee40fcb525
CACHE_DIR=${FFMPEG_CACHE_DIR:-$HOME/.cache/ci-ffmpeg}

APT_OPTS=(-o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 -o DPkg::Lock::Timeout=60)
apt_install() { # apt with hard time limits; never the first choice. -q (not -qq) so a stall shows which download it is on.
  echo "apt: installing $* (update up to 5 min, install up to 10 min)"
  timeout 300 sudo apt-get "${APT_OPTS[@]}" update -q
  timeout 600 sudo apt-get "${APT_OPTS[@]}" install -y -q --no-install-recommends "$@"
}

static_ffmpeg() {
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) arch=linux64; sha=$FFMPEG_SHA256_linux64 ;;
    Linux-aarch64 | Linux-arm64) arch=linuxarm64; sha=$FFMPEG_SHA256_linuxarm64 ;;
    *) echo "no pinned static ffmpeg for $(uname -s) $(uname -m)"; return 1 ;;
  esac
  name="$FFMPEG_BUILD-$arch-gpl-8.1"; file="$CACHE_DIR/$name.tar.xz"
  mkdir -p "$CACHE_DIR"
  if [ -f "$file" ] && echo "$sha  $file" | sha256sum -c --quiet >/dev/null 2>&1; then
    echo "static ffmpeg: using the cached $name.tar.xz"
  else
    echo "static ffmpeg: downloading $name.tar.xz ($FFMPEG_TAG)"
    rm -f "$file"
    curl -fSL --retry 3 --retry-delay 5 --connect-timeout 20 --max-time 300 --no-progress-meter \
      "https://github.com/BtbN/FFmpeg-Builds/releases/download/$FFMPEG_TAG/$name.tar.xz" -o "$file.part" || { rm -f "$file.part"; return 1; }
    echo "$sha  $file.part" | sha256sum -c --quiet || { echo "static ffmpeg: checksum mismatch"; rm -f "$file.part"; return 1; }
    mv "$file.part" "$file"
  fi
  tmp=$(mktemp -d)
  tar -xJf "$file" -C "$tmp" --strip-components=2 "$name/bin/ffmpeg" "$name/bin/ffprobe" || return 1
  sudo install -m 0755 "$tmp/ffmpeg" "$tmp/ffprobe" /usr/local/bin/
  rm -rf "$tmp"
}

if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
  static_ffmpeg || { echo "static ffmpeg failed; using apt"; apt_install ffmpeg; }
fi
ffmpeg -version | head -1
ffprobe -version | head -1

if [ "${1:-}" = "--test-tools" ]; then
  missing=(); command -v lsof >/dev/null || missing+=(lsof); command -v ss >/dev/null || missing+=(iproute2)
  python3 -c "import PIL, numpy" 2>/dev/null || {
    echo "pip: installing pillow numpy (up to 5 min)"
    timeout 300 python3 -m pip install --quiet --user pillow numpy 2>/dev/null ||
    timeout 300 python3 -m pip install --quiet --user --break-system-packages pillow numpy 2>/dev/null ||
    missing+=(python3-pil python3-numpy); }
  [ ${#missing[@]} -eq 0 ] || apt_install "${missing[@]}"
  python3 -c "import PIL, numpy; print('Pillow', PIL.__version__, 'NumPy', numpy.__version__)"
fi
