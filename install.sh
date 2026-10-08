#!/usr/bin/env bash
# Install gemini-image and gemini-video as agent skills by symlinking them from this clone.
# Targets: Claude Code (~/.claude/skills) and Codex (~/.agents/skills).
# Existing non-symlink skills with the same name are moved to a backup folder, never deleted.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS=(gemini-image gemini-video)
TARGETS=("$HOME/.claude/skills" "$HOME/.agents/skills")
BACKUP="$HOME/.local/share/gemini-media-skill-backups/$(date +%Y%m%d-%H%M%S)"

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
  ok "agy $("$AGY" --version 2>/dev/null | head -1) (gemini-image). Sign in once by running: agy"
else
  warn "Antigravity CLI (agy) not found. gemini-image needs it: https://antigravity.google/download"
fi

ASIDE="$(command -v aside || true)"; [ -z "$ASIDE" ] && [ -x "$HOME/.local/bin/aside" ] && ASIDE="$HOME/.local/bin/aside"
if [ -n "$ASIDE" ]; then
  ok "aside CLI found (gemini-video). Keep the Aside browser open and signed in to Google."
else
  warn "aside CLI not found. gemini-video needs the Aside browser + CLI: https://aside.com"
fi

case "$(uname -s)" in
  Darwin) ok "macOS (sips available for image format conversion)";;
  *) warn "non-macOS: gemini-image saves the original JPEG if sips is unavailable";;
esac

echo
echo "Done. Restart your agent session, then try:"
echo "  Claude Code: /gemini-image a cozy reading room at sunset, 16:9"
echo "  Claude Code: /gemini-video a paper boat drifting down a rainy street, 9:16"
