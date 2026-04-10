#!/usr/bin/env bash
# =============================================================================
# sync-cookies.sh
#
# PURPOSE
#   Export YouTube cookies from your local browser and push them to a remote
#   server so that transcribe.py can run headlessly without a browser.
#
# HOW IT WORKS
#   1. Uses yt-dlp to read cookies directly from your local Chrome (or other
#      browser) cookie store and writes them to a temporary Netscape-format
#      cookies.txt file.
#   2. Copies that file to the remote server via scp.
#
#   On the server, pass the file to transcribe.py:
#     python transcribe.py <url> --cookies ~/scripts/yt-cookies.txt --no-diarize
#
#   Or set the env var once and forget it:
#     export YT_COOKIES_FILE=~/scripts/yt-cookies.txt
#
# WHEN TO RUN
#   YouTube session cookies typically last 1–3 weeks. Run this script when
#   you start seeing 403 / sign-in-required errors on the server. If errors
#   recur within hours, the server IP is likely flagged by YouTube's bot
#   detection — refreshing cookies won't fully solve that.
#
# PREREQUISITES (local machine)
#   - yt-dlp  (pip install yt-dlp  OR  brew install yt-dlp)
#   - ssh access to the remote server
#   - On macOS: first run will prompt for Keychain access (Chrome cookie
#     decryption). Choose "Always Allow" to avoid being prompted each time.
#
# USAGE
#   ./sync-cookies.sh
#
#   Override any setting via environment variable:
#     BROWSER=firefox REMOTE_SERVER=me@other.host ./sync-cookies.sh
# =============================================================================
set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration — edit these or override via environment variables
# -----------------------------------------------------------------------------

# Browser to extract cookies from.
# Supported: chrome, firefox, safari, edge, chromium, brave, opera, vivaldi
BROWSER="${BROWSER:-chrome}"

# Remote server (user@host) to push the cookies file to.
REMOTE_SERVER="${REMOTE_SERVER:-}"

# Path on the remote server where the cookies file will be written.
REMOTE_PATH="${REMOTE_PATH:-~/scripts/yt-cookies.txt}"

# Temporary local path used during export (cleaned up on exit).
LOCAL_TMP="$(mktemp /tmp/yt-cookies.XXXXXX.txt)"

# A public YouTube URL used to trigger the cookie export.
# Any valid YouTube URL will do — the video is not downloaded.
PROBE_URL="https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

cleanup() { rm -f "$LOCAL_TMP"; }
trap cleanup EXIT

info()  { echo "[sync-cookies] $*"; }
error() { echo "[sync-cookies] ERROR: $*" >&2; exit 1; }

# -----------------------------------------------------------------------------
# Checks
# -----------------------------------------------------------------------------

command -v yt-dlp  >/dev/null 2>&1 || error "yt-dlp not found — install with: pip install yt-dlp"
command -v scp     >/dev/null 2>&1 || error "scp not found"

if [[ -z "$REMOTE_SERVER" ]]; then
    error "REMOTE_SERVER is not set. Edit the script or run:
       REMOTE_SERVER=user@your-server.com ./sync-cookies.sh"
fi

# -----------------------------------------------------------------------------
# Step 1 — Export cookies from local browser
# -----------------------------------------------------------------------------

info "Exporting cookies from $BROWSER..."
info "(On macOS, Chrome may ask for Keychain access — choose 'Always Allow')"

yt-dlp \
    --cookies-from-browser "$BROWSER" \
    --cookies "$LOCAL_TMP" \
    --skip-download \
    --quiet \
    "$PROBE_URL"

COOKIE_COUNT=$(grep -c "youtube.com" "$LOCAL_TMP" 2>/dev/null || echo 0)
info "Exported $COOKIE_COUNT YouTube cookies."

[[ "$COOKIE_COUNT" -eq 0 ]] && error "No YouTube cookies found — are you logged in to YouTube in $BROWSER?"

# -----------------------------------------------------------------------------
# Step 2 — Push to remote server
# -----------------------------------------------------------------------------

info "Copying to $REMOTE_SERVER:$REMOTE_PATH ..."
scp "$LOCAL_TMP" "$REMOTE_SERVER:$REMOTE_PATH"

info "Done. On the server, run transcribe.py with:"
info "  python transcribe.py <url> --cookies $REMOTE_PATH --no-diarize"
info ""
info "Or set it once in your shell profile:"
info "  export YT_COOKIES_FILE=$REMOTE_PATH"
