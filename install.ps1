# Windows installer: links gemini-image and gemini-video into Claude Code (~\.claude\skills) and Codex (~\.agents\skills).
# Uses directory junctions (no admin rights needed). Existing same-named skills are moved to a backup folder, never deleted.
$ErrorActionPreference = "Stop"

$Repo = $PSScriptRoot
$Skills = @("gemini-image", "gemini-video")
$Targets = @("$HOME\.claude\skills", "$HOME\.agents\skills")
$Backup = "$HOME\.local\share\gemini-media-skill-backups\$(Get-Date -Format yyyyMMdd-HHmmss)"

function Ok($m)   { Write-Host "  ok   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  warn $m" -ForegroundColor Yellow }

Write-Host "Installing skills from $Repo"
foreach ($t in $Targets) {
    New-Item -ItemType Directory -Force -Path $t | Out-Null
    foreach ($s in $Skills) {
        $dest = Join-Path $t $s
        $src = Join-Path $Repo "skills\$s"
        $item = Get-Item $dest -Force -ErrorAction SilentlyContinue
        if ($item -and $item.LinkType) {
            $item.Delete()
        } elseif ($item) {
            $b = Join-Path $Backup (Split-Path $t -Leaf)
            New-Item -ItemType Directory -Force -Path $b | Out-Null
            Move-Item $dest (Join-Path $b $s)
            Warn "existing $dest moved to $b"
        }
        New-Item -ItemType Junction -Path $dest -Target $src | Out-Null
        Ok "$dest -> $src"
    }
}

Write-Host "`nChecking requirements"
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) { Ok "node $(node --version)" } else { Warn "node not found (18+ required)" }

$agy = Get-Command agy -ErrorAction SilentlyContinue
if (-not $agy -and (Test-Path "$env:LOCALAPPDATA\agy\bin\agy.exe")) { $agy = "$env:LOCALAPPDATA\agy\bin\agy.exe" }
if ($agy) { Ok "agy found. Sign in once by running: agy" } else { Warn "Antigravity CLI (agy) not found: irm https://antigravity.google/cli/install.ps1 | iex" }

$aside = Get-Command aside -ErrorAction SilentlyContinue
if ($aside) { Ok "aside CLI found (gemini-video)" } else { Warn "aside CLI not found (gemini-video only): https://aside.com/download" }

Write-Host "`nDone. Restart your agent session, then try:"
Write-Host "  /gemini-image a cozy reading room at sunset, 16:9"
