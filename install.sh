#!/usr/bin/env bash
# Install gemini-image as an agent skill by symlinking it from this clone (macOS / Linux / Git Bash).
# On Windows PowerShell use install.ps1 instead.
# Targets: Claude Code (~/.claude/skills) and Codex (~/.agents/skills).
# An existing non-symlink skill with the same name is moved to a backup folder, never deleted.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS=(gemini-image)
TARGETS=("$HOME/.claude/skills" "$HOME/.agents/skills")
BACKUP="$HOME/.local/share/bananoclaude-images-backups/$(date +%Y%m%d-%H%M%S)"

ok()   { printf '  \033[32mok\033[0m   %s\n' "$1"; }
warn() { printf '  \033[33mwarn\033[0m %s\n' "$1"; }

echo "Installing skills from $REPO"
for target in "${TARGETS[@]}"; do
  mkdir -p "$target"
  for s in "${SKILLS[@]}"; do
    dest="$target/$s"
    if [ -L "$dest" ]; then
      ln -sfn "$REPO/skills/$s" "$dest"
    elif [ -e "$dest" ]; then
      mkdir -p "$BACKUP/$(basename "$target")"
      mv "$dest" "$BACKUP/$(basename "$target")/$s"
      ln -s "$REPO/skills/$s" "$dest"
      warn "existing $dest moved to $BACKUP"
    else
      ln -s "$REPO/skills/$s" "$dest"
    fi
    ok "$dest -> $REPO/skills/$s"
  done
done

echo
echo "Checking requirements"
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -ge 18 ]; then ok "node $(node --version)"; else warn "node $(node --version) found; 18+ required"; fi
else
  warn "node not found (18+ required)"
fi

AGY="$(command -v agy || true)"; [ -z "$AGY" ] && [ -x "$HOME/.local/bin/agy" ] && AGY="$HOME/.local/bin/agy"
if [ -n "$AGY" ]; then
  ok "agy $("$AGY" --version 2>/dev/null | head -1). Sign in once by running: agy"
else
  warn "Antigravity CLI (agy) not found. Install it: https://antigravity.google/download"
fi

case "$(uname -s)" in
  Darwin) ok "macOS (sips available for PNG/WebP conversion)";;
  *) warn "no sips here: images are saved in the format agy returns (JPEG)";;
esac

echo
echo "Done. Restart your agent session, then try:"
echo "  Claude Code: /gemini-image a cozy reading room at sunset, 16:9"
