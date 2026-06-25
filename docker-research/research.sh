#!/usr/bin/env bash
# research.sh — Build & run the agy Linux research container
# Usage: ./research.sh [probe|shell]
#   probe  — Run automated probes and dump results (default)
#   shell  — Drop into interactive bash (for manual exploration)

set -euo pipefail

IMAGE="agy-linux-research"
CWD="$(cd "$(dirname "$0")" && pwd)"

echo "🔨 Building research container..."
docker build -q -t "$IMAGE" "$CWD"

MODE="${1:-probe}"

if [ "$MODE" = "shell" ]; then
  echo "🐚 Dropping into interactive shell..."
  echo "   Tip: run 'agy --version', 'agy auth login', 'ls ~/.gemini/antigravity-cli/'"
  docker run --rm -it "$IMAGE" bash
  exit 0
fi

# --- Automated probe mode ---
echo ""
echo "🔬 Running automated probes..."
echo "============================================"

docker run --rm "$IMAGE" bash -c '
set -e
PATH="/home/researcher/.local/bin:$PATH"

echo ""
echo "=== 1. agy binary location & version ==="
which agy 2>/dev/null || echo "ERROR: agy not found in PATH"
agy --version 2>/dev/null || agy version 2>/dev/null || echo "NOTE: --version flag not supported, try other subcommands"

echo ""
echo "=== 2. ~/.gemini/antigravity-cli/ structure (before auth) ==="
ls -la ~/.gemini/antigravity-cli/ 2>/dev/null || echo "(directory does not exist yet)"

echo ""
echo "=== 3. ~/.local/bin contents ==="
ls -la ~/.local/bin/ 2>/dev/null || echo "(empty)"

echo ""
echo "=== 4. Binary file info ==="
file ~/.local/bin/agy 2>/dev/null || echo "(no binary)"

echo ""
echo "=== 5. Check for secret-service / keyring tools on system ==="
which secret-tool 2>/dev/null && echo "secret-tool: FOUND" || echo "secret-tool: NOT FOUND"
which gnome-keyring-daemon 2>/dev/null && echo "gnome-keyring-daemon: FOUND" || echo "gnome-keyring-daemon: NOT FOUND"
ls /run/user/ 2>/dev/null || echo "/run/user: NOT FOUND (no D-Bus session)"

echo ""
echo "=== 6. Environment variables relevant to auth ==="
env | grep -iE "(GOOGLE|GEMINI|DBUS|XDG|HOME|USER)" | sort || true

echo ""
echo "=== 7. agy help / subcommand list ==="
agy --help 2>/dev/null || agy help 2>/dev/null || echo "(no help output)"

echo ""
echo "=== 8. agy auth subcommand ==="
agy auth --help 2>/dev/null || echo "(no auth --help)"

echo ""
echo "=== 9. ~/.gemini/antigravity-cli/ after binary runs ==="
ls -la ~/.gemini/antigravity-cli/ 2>/dev/null || echo "(still does not exist)"

echo ""
echo "=== PROBE COMPLETE ==="
' 2>&1

echo ""
echo "============================================"
echo "✅ Probe done. Review output above."
echo ""
echo "To explore interactively: ./research.sh shell"
