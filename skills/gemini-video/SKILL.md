---
name: gemini-video
description: Generate Veo videos on the user's Google AI plan by driving their own logged-in Gemini web app (default) or Google Flow inside the Aside browser via `aside repl`. Use when the user asks for a Gemini / Veo / Flow video, text-to-video, or image-to-video without an API key. Pair with gemini-image to create a reference still first.
---

# Gemini Video (browser bridge)

There is no official CLI for Veo on a consumer subscription (Antigravity `agy` only generates images). This skill drives the user's own logged-in browser:

agent -> `scripts/gemini_video.mjs` -> `aside repl` (runs `scripts/browser_lib.js` in the Aside browser) -> generate -> poll -> download MP4 -> project folder.

Requirements: [Aside](https://aside.com) browser running, `aside` CLI on PATH, the Google account signed in to Gemini/Flow inside Aside. No cookies or tokens leave the browser.

`<skill-dir>` below is the directory containing this SKILL.md.

## Backends

| | `--backend gemini` (default) | `--backend flow` |
|---|---|---|
| Where | gemini.google.com, "Create video" tool | flow.google.com, one new project per run |
| Quota | Gemini app video allowance (no Flow/AI credits) | Flow daily credits, then Google AI credits |
| Output (tested) | 10 s, 720p, audio | Veo 3.1 Lite: 8 s, 720p, audio |
| References | 1 image | up to 3 images ("Ingredients") |
| Model choice | none (Gemini decides) | `--model lite|fast|quality|omni` with cost guard |
| Watermark | small Gemini sparkle, bottom-right | small "Veo" text, bottom-right (forced in some regions) |

Default to `gemini`. Use `flow` when the user needs a specific model, more than one reference image, or the Gemini allowance is used up.

## Generate

```bash
node <skill-dir>/scripts/gemini_video.mjs generate \
  --prompt "Use this image as the character. The robot walks under a red umbrella on a rainy street at night, rain sound." \
  --ref generated-images/robot.png --aspect 9:16 \
  --expect-account you@gmail.com \
  --out generated-videos/robot.mp4
```

Prints `PATH=`, `SIZE=`, `DURATION=`, `AUDIO=`, plus `CHAT=` (gemini) or `CREDITS=` / `PROJECT=` (flow). Takes ~1-3 min; run it in the background and update the user.

Common options: `--aspect 16:9|9:16`, `--ref PATH`, `--expect-account EMAIL` (abort if a different Google account is signed in), `--account u1` (another Aside profile), `--timeout-min N`.
Flow only: `--model`, `--max-credits N` (default 20; aborts *before* submitting if Flow shows a higher cost; never raise it without the user's OK), `--duration 4|6|8|10`, `--resolution 360p|720p`.

Other commands:

```bash
node <skill-dir>/scripts/gemini_video.mjs credits                                # Flow + Google AI credits
node <skill-dir>/scripts/gemini_video.mjs poll --project <CHAT or PROJECT URL> --out x.mp4   # resume
```

## Rules

1. One generation at a time. Each run opens its own new Gemini chat or Flow project; never touch the user's other chats or projects.
2. If Gemini answers without a video (limit reached, refusal), report its message and offer `--backend flow`; do not loop.
3. Flow refunds failed generations; the script retries once, then stops.
4. Both backends add a visible watermark. Do not promise a clean commercial master.
5. Check start/middle/end frames (ffmpeg) before calling a video done.
6. If a UI element is not found, Google changed the page. Report it, and fall back to `aside exec "In Gemini, create a video ..."` rather than guessing selectors.
