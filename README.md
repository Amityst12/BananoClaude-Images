# Gemini Media Skill

[한국어](README.ko.md)

> **Local Windows fork: image only.** `gemini-video` (which needs the Aside browser) was removed and `install.ps1` replaces `install.sh` on Windows. The video sections below are kept from upstream and do not apply here.

Generate **Gemini images (Nano Banana)** and **Veo videos** from Claude Code or Codex using the **Google AI subscription you already pay for**. No Gemini API key, no per-call billing, no exported tokens.

| Image (text) | Image (reference) | Video (reference, Gemini web) |
|---|---|---|
| <img src="assets/image-text.jpg" width="240"> | <img src="assets/image-reference.jpg" width="135"> | <img src="assets/video-gemini.gif" width="135"> |

Inspired by [GENEXIS-AI/gpt-image-skill](https://github.com/GENEXIS-AI/gpt-image-skill), which does the same for ChatGPT images through Codex.

## How it works

Google does not offer OAuth for third-party clients, and people who plugged Antigravity OAuth tokens into other tools have had their accounts suspended. This project never touches tokens. It only drives **official Google surfaces** the same way you would:

```
gemini-image:  agent -> node script -> official `agy -p` (Antigravity CLI, headless) -> built-in generate_image -> PNG in your project
gemini-video:  agent -> node script -> `aside repl` -> your logged-in Gemini web / Flow tab -> MP4 in your project
```

- **Images** use the Antigravity CLI's built-in `generate_image` tool, billed to your Google AI plan's Antigravity quota. The script strips `GEMINI_API_KEY` / `GOOGLE_API_KEY` so agy can never fall back to paid API-key mode.
- **Videos** have no official CLI (agy has no video tool), so the skill operates the Gemini web app ("Create video") or Google Flow in your own browser session via [Aside](https://aside.com)'s Playwright-style REPL. Downloads happen inside that session; cookies never leave the browser.

## Requirements

| | gemini-image | gemini-video |
|---|---|---|
| Plan | Google AI Pro / Ultra (Antigravity quota) | Google AI plan with Gemini video / Flow access |
| Tools | [Antigravity CLI](https://antigravity.google/download) `agy`, signed in once | [Aside](https://aside.com) browser + `aside` CLI, signed in to Google |
| Runtime | Node.js 18+ | Node.js 18+ |

Tested on macOS with agy 1.3.1 and Aside CLI 1.26 (Oct 2026). `ffmpeg`/`ffprobe` are optional (used to report video size/duration).

## Install

```bash
git clone https://github.com/inyounglee-datapopcorn/gemini-media-skill.git ~/.local/share/gemini-media-skill
~/.local/share/gemini-media-skill/install.sh
```

`install.sh` symlinks both skills into `~/.claude/skills` (Claude Code) and `~/.agents/skills` (Codex), moves any same-named existing skill to a backup folder, and checks for `node`, `agy`, and `aside`. Update with `git pull`; the symlinks pick it up.

First-time sign-in for images: run `agy` once in a terminal and sign in with Google. In Antigravity settings, set **AI Credit Overages** to **Never** so going past your baseline quota cannot spend purchased credits.

## Usage

Just ask your agent:

```
/gemini-image A cobalt-blue glass robot on a warm off-white background, 1:1
/gemini-image Use @robot.png as the character. Put it on a rainy Seoul street at night, 9:16 poster
/gemini-video Use generated-images/robot.png as the character. It rides a bicycle through the rain, 16:9
```

Or call the scripts directly:

```bash
# Image (text or reference). Output: PATH=, SIZE=, MARKDOWN=
node ~/.claude/skills/gemini-image/scripts/gemini_image.mjs generate \
  --prompt "A glass robot riding a bicycle on a rainy street, 16:9 landscape" \
  --ref robot.png --out generated-images/robot-bike.png
node ~/.claude/skills/gemini-image/scripts/gemini_image.mjs usage      # remaining quota

# Video via Gemini web (default). Output: PATH=, SIZE=, DURATION=, AUDIO=
node ~/.claude/skills/gemini-video/scripts/gemini_video.mjs generate \
  --prompt "Use this image as the character. The robot waves at the camera in a sunny park." \
  --ref robot.png --aspect 9:16 --expect-account you@gmail.com --out generated-videos/wave.mp4

# Video via Google Flow (pick a model, up to 3 references, hard cost cap)
node ~/.claude/skills/gemini-video/scripts/gemini_video.mjs generate --backend flow \
  --model lite --max-credits 20 --prompt "..." --out generated-videos/clip.mp4
node ~/.claude/skills/gemini-video/scripts/gemini_video.mjs credits    # Flow + AI credits
```

## What we measured

| Path | Result | Time | Cost |
|---|---|---|---|
| gemini-image, text | 1024x1024 JPEG/PNG | ~70 s | ~1% of a 5-hour Antigravity window |
| gemini-image, reference + "16:9" / "9:16" | 1376x768 / 768x1376 | 36-50 s | same |
| gemini-video, Gemini web | 720p, 10 s, audio | ~1 min | Gemini app video allowance |
| gemini-video, Flow Veo 3.1 Lite | 720p, 8 s, audio | ~1 min | 10 credits (Fast: 20) |

## Limits and honest caveats

- **Watermarks.** Gemini web videos carry a small sparkle mark; Flow videos carry a small "Veo" mark (mandatory in some regions). Images and videos also carry invisible SynthID.
- **Quotas are your plan's.** Nothing here bypasses limits or makes features available on plans that lack them. The Gemini app's daily video allowance is not shown in the UI; the skill reports Gemini's message when you hit it.
- **gemini-video automates a web UI.** It opens pages with `?hl=en` and matches English and Korean labels, but Google can change the page at any time. When that happens the script fails loudly ("UI element not found") instead of guessing. Automating a consumer web app may conflict with Google's terms; use it for your own account, at your own risk, at human-like volume.
- **Image text** (signs, labels) can be garbled and real brand names can appear unprompted. Check before commercial use.
- **Transparent backgrounds** are not supported by the agy image tool.
- Each video run creates a new Gemini chat or Flow project in your account. Clean them up if you like.

## Safety boundaries

- Never reads `~/.gemini` credential files, never extracts cookies or OAuth tokens, never calls Google backends directly.
- Never passes `--dangerously-skip-permissions` to agy; runs it with `--sandbox` and flags any side-effecting tool call.
- Flow runs read the real credit cost from the page and abort *before* submitting if it exceeds `--max-credits`.
- `--expect-account` aborts if a different Google account is signed in.

## License

MIT
