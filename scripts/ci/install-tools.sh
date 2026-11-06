#!/usr/bin/env bash
# CI only: install ffmpeg/ffprobe (and optionally test tools) quickly and without hanging.
# Ubuntu's package mirror stalled CI for 15-25 min many times on 6 Nov 2026, so ffmpeg comes from a static
# build first (seconds), with apt as a time-limited fallback. Usage: install-tools.sh [--test-tools]
set -euo pipefail
APT_OPTS=(-o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 -o DPkg::Lock::Timeout=60)
apt_install() { # apt with hard time limits; never the first choice
  timeout 300 sudo apt-get "${APT_OPTS[@]}" update -qq
  timeout 600 sudo apt-get "${APT_OPTS[@]}" install -y -qq --no-install-recommends "$@"
}
static_ffmpeg() {
  case "$(uname -m)" in x86_64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; *) return 1 ;; esac
  url="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${arch}-static.tar.xz"
  tmp=$(mktemp -d)
  curl -fsSL --retry 3 --retry-delay 5 --connect-timeout 20 --max-time 180 "$url" -o "$tmp/ff.tar.xz" || return 1
  curl -fsSL --retry 3 --connect-timeout 20 --max-time 30 "$url.md5" -o "$tmp/ff.md5" || return 1
  (cd "$tmp" && echo "$(cut -d' ' -f1 ff.md5)  ff.tar.xz" | md5sum -c --quiet) || return 1
  tar -xJf "$tmp/ff.tar.xz" -C "$tmp" --strip-components=1 --wildcards '*/ffmpeg' '*/ffprobe'
  sudo install -m 0755 "$tmp/ffmpeg" "$tmp/ffprobe" /usr/local/bin/
}
if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
  static_ffmpeg || { echo "static ffmpeg failed; using apt"; apt_install ffmpeg; }
fi
ffmpeg -version | head -1
if [ "${1:-}" = "--test-tools" ]; then
  missing=(); command -v lsof >/dev/null || missing+=(lsof); command -v ss >/dev/null || missing+=(iproute2)
  python3 -c "import PIL, numpy" 2>/dev/null || {
    timeout 300 python3 -m pip install --quiet --user pillow numpy 2>/dev/null ||
    timeout 300 python3 -m pip install --quiet --user --break-system-packages pillow numpy 2>/dev/null ||
    missing+=(python3-pil python3-numpy); }
  [ ${#missing[@]} -eq 0 ] || apt_install "${missing[@]}"
  python3 -c "import PIL, numpy; print('Pillow', PIL.__version__, 'NumPy', numpy.__version__)"
fi
