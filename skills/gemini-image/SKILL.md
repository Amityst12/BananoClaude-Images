---
name: gemini-image
description: Generate or edit images with Google's built-in Antigravity image tool (Nano Banana family) on the user's Google AI subscription, by running the official Antigravity CLI (agy) headlessly. Use whenever the user asks to generate, create, draw or edit an image, picture, illustration, avatar or poster (a Gemini / Nano Banana image), wants to use leftover Google subscription quota for images, or wants a reference-guided image or edit without an API key. Not for diagrams, charts, SVG or UI mockups. Image only (no video).
---

# Gemini Image (agy bridge)

Bridge: agent -> `scripts/gemini_image.mjs` -> official `agy -p` (headless) -> built-in `generate_image` -> file copied into the current project.

The script only launches the official `agy` binary. It never reads `~/.gemini` credential files, never calls Google backends directly, and removes `GEMINI_API_KEY` / `GOOGLE_API_KEY` from the child environment so agy cannot switch to separately billed API-key mode.

`<skill-dir>` below is the directory containing this SKILL.md (for example `~/.claude/skills/gemini-image` or `~/.agents/skills/gemini-image`).

## Generate

```bash
node <skill-dir>/scripts/gemini_image.mjs generate \
  --prompt "A cobalt-blue glass robot on a warm off-white background, 1:1" \
  --out generated-images/robot.png
```

Output lines: `PATH=`, `SIZE=`, `SOURCE=`, `SECONDS=`, `MARKDOWN=`, then `QUOTA_5H=` / `QUOTA_WEEK=` (remaining Gemini quota and reset time; add `--no-quota` to skip). Show the result with the `MARKDOWN` line and look at the image yourself before calling it done.

**After every image, tell the user the remaining quota** in one short line, from the `QUOTA_*` lines (for example: "5-hour quota: 96% left, weekly: 97% left"). Warn when either drops below 20%.

## Rules

1. **Prompt fidelity.** Pass the user's request unchanged. Only when the user asks for several *different* designs, write one distinct complete prompt per output.
2. **Aspect ratio goes in the prompt** in plain words ("16:9 landscape", "9:16 vertical"). Tested: 16:9 -> 1376x768, 9:16 -> 768x1376. Exact pixel sizes are not controllable.
3. **References are files.** Pass each with `--ref PATH` (repeatable; order = Image 1, Image 2, ...). If the user pasted an image in chat, save it to a project path first. Never replace a missing reference with a text description.
4. **Revisions edit the latest result.** For "change the one you just made", pass the previous `PATH=` as the first `--ref`.
5. **Parallel:** at most 2 generate commands at once (each takes ~40-70 s).
6. **Never** add `--dangerously-skip-permissions`, never set an API key, never read or copy credential files.
7. The tool returns JPEG; `.png` / `.webp` output paths are converted with `sips` (macOS). Transparent backgrounds are NOT guaranteed; say so instead of faking it.
8. Generated text in images (signs, labels) can be garbled, and real brands can appear unprompted. Check before commercial use.
9. If `WARNING: unexpected tool used` appears, tell the user agy did something other than image generation.

## Quota

```bash
node <skill-dir>/scripts/gemini_image.mjs usage
```

Shows remaining 5-hour / weekly limits. The image model has its own cap that `usage` does not show (Gemini totals can read 97% while images return 429 `RESOURCE_EXHAUSTED`); the script reports "image model cap reached" with the reset time, which you pass on to the user. On a limit error, report it; do not retry in a loop and do not switch to a paid API. Keep Antigravity's "AI Credit Overages" setting on **Never** so exceeding the baseline quota cannot spend purchased credits.

## Troubleshooting

- `agy is not signed in`: the user runs `agy` once in a terminal and signs in with Google.
- `--dry-run` prints the exact agy invocation without generating.
- Raw agy logs: `~/.gemini/antigravity-cli/brain/<conversation-id>/`.
