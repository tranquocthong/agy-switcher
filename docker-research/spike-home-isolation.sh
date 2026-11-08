#!/usr/bin/env bash
# Spike: can agy be isolated per profile by overriding HOME (aimux-style),
# instead of swapping ~/.gemini + the global keychain slot?
#
# Run this in a SEPARATE terminal tab (agy needs a real TTY for login).
# It never writes to your real ~/.gemini; it only reads the real keychain
# slot to compare a hash before/after, and it prints no secrets.
#
# Usage: docker-research/spike-home-isolation.sh [spike-home-dir]
set -euo pipefail

SPIKE_HOME="${1:-$HOME/.agyw-spike/home1}"
AGY="${AGY:-$HOME/.local/bin/agy}"

slot_hash() {
  security find-generic-password -s gemini -a antigravity -w 2>/dev/null \
    | tr -d '\n' | shasum -a 256 | cut -c1-12 || true
}
real_state() {
  # path + mtime of the real dir, to detect accidental writes
  find "$HOME/.gemini" -type f -newermt "$1" 2>/dev/null | head -20
}

if pgrep -f "$AGY" >/dev/null 2>&1 || pgrep -x agy >/dev/null 2>&1; then
  echo "agy is already running. Quit it first so the keychain comparison is clean." >&2
  exit 1
fi

mkdir -p "$SPIKE_HOME"
START="$(date '+%Y-%m-%d %H:%M:%S')"
BEFORE="$(slot_hash)"
echo "spike HOME        : $SPIKE_HOME"
echo "real keychain slot: $BEFORE (before)"
echo
echo "Starting agy with HOME=$SPIKE_HOME."
echo "  1) Log in with a DIFFERENT Google account than your current one."
echo "  2) Send one short prompt (e.g. 'say ok') so it persists state."
echo "  3) Exit agy (Ctrl+C / /quit)."
echo
read -r -p "Press Enter to launch agy... " _

HOME="$SPIKE_HOME" "$AGY" || true

AFTER="$(slot_hash)"
echo
echo "=== RESULT ==="
echo "real keychain slot: $BEFORE -> $AFTER  ($([ "$BEFORE" = "$AFTER" ] && echo UNCHANGED || echo CHANGED))"
echo
echo "files created under spike HOME (names only):"
find "$SPIKE_HOME" -type f 2>/dev/null | sed "s#$SPIKE_HOME/##" | head -40
echo
echo "token file present?:"
find "$SPIKE_HOME" -name '*oauth*' -o -name 'keychain*' 2>/dev/null | sed "s#$SPIKE_HOME/##"
echo
echo "real ~/.gemini files modified since start (should be empty):"
real_state "$START"
echo
echo "Interpretation:"
echo "  slot UNCHANGED + token file under spike HOME  -> HOME isolation works (aimux-style is viable)"
echo "  slot CHANGED                                  -> agy still uses the global keychain; env-based isolation is NOT enough"
echo "  real ~/.gemini modified                       -> agy ignores HOME for that path"
