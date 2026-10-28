#!/usr/bin/env node
// gemini-image bridge: Claude Code -> official Antigravity CLI (agy) headless -> built-in generate_image.
// Uses the signed-in Google AI subscription quota. Never reads OAuth files, never uses an API key.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, statSync, readdirSync, copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const BRAIN = path.join(HOME, ".gemini", "antigravity-cli", "brain");
const IMG_RE = /\.(png|jpe?g|webp)$/i;
const RISKY_TOOL = /^(run_command|send_command_input|write_to_file|replace_file_content|multi_replace_file_content|sed_file|notebook_execution|notebook_edit|send_message|delete_knowledge|run_workflow|call_mcp_tool|browser_.*|open_browser_url|execute_browser_javascript|click_browser_pixel)$/;

function die(msg, code = 1) {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const o = { refs: [], timeout: "10m", effort: "low", overwrite: false, dryRun: false };
  const cmd = argv[0] && !argv[0].startsWith("--") ? argv.shift() : "generate";
  o.cmd = cmd;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) die(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--prompt") o.prompt = next();
    else if (a === "--ref" || a === "--reference" || a === "--edit-target") o.refs.push(next());
    else if (a === "--out") o.out = next();
    else if (a === "--model") o.model = next();
    else if (a === "--effort") o.effort = next();
    else if (a === "--timeout") o.timeout = next();
    else if (a === "--overwrite") o.overwrite = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--no-quota") o.noQuota = true;
    else die(`unknown argument: ${a}`);
  }
  return o;
}

function findAgy() {
  const win = process.platform === "win32";
  const candidates = [
    process.env.AGY_BIN,
    win && process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "agy", "bin", "agy.exe"),
    win && process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Antigravity", "agy.exe"),
    path.join(HOME, ".local", "bin", win ? "agy.exe" : "agy"),
    "/opt/homebrew/bin/agy",
    "/usr/local/bin/agy",
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  const w = spawnSync(win ? "where" : "which", ["agy"], { encoding: "utf8" });
  if (w.status === 0 && w.stdout.trim()) return w.stdout.trim().split(/\r?\n/)[0];
  die("Antigravity CLI (agy) not found. Install it and sign in once interactively with `agy`.", 3);
}

// Strip anything that would switch agy to API-key / separately billed mode.
function subscriptionEnv() {
  const env = { ...process.env };
  for (const k of [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENAI_API_KEY",
    "GOOGLE_GENAI_USE_VERTEXAI",
    "GOOGLE_APPLICATION_CREDENTIALS",
  ]) delete env[k];
  return env;
}

function slug(s) {
  return (s || "image")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "image";
}

function newestImagesSince(dirs, sinceMs) {
  const found = [];
  for (const d of dirs) {
    if (!d || !existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (!IMG_RE.test(f)) continue;
      try {
        const st = statSync(p);
        if (st.isFile() && st.mtimeMs >= sinceMs) found.push({ p, t: st.mtimeMs });
      } catch {}
    }
  }
  return found.sort((a, b) => b.t - a.t).map((x) => x.p);
}

// Read pixel size straight from the PNG/JPEG header (no sips needed on Windows/Linux).
function headerDims(file) {
  try {
    const b = readFileSync(file);
    if (b.length > 24 && b.toString("latin1", 1, 4) === "PNG") return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return `${b.readUInt16BE(i + 7)}x${b.readUInt16BE(i + 5)}`;
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch {}
  return "unknown";
}

function dims(file) {
  if (process.platform !== "darwin") return headerDims(file);
  const r = spawnSync("sips",["-g", "pixelWidth", "-g", "pixelHeight", file], { encoding: "utf8" });
  const w = r.stdout?.match(/pixelWidth:\s*(\d+)/)?.[1];
  const h = r.stdout?.match(/pixelHeight:\s*(\d+)/)?.[1];
  return w && h ? `${w}x${h}` : "unknown";
}

// Best-effort remaining-quota summary for the Gemini models (image generation uses these).
// `agy -p /usage` rows: <group>\t<limit name>\t<remaining %>\t<reset ISO time>
function quotaLines(agy) {
  try {
    const r = spawnSync(agy, ["-p", "/usage"], { encoding: "utf8", env: subscriptionEnv(), timeout: 60000 });
    const lines = [];
    for (const row of (r.stdout || "").split(/\r?\n/)) {
      const [group, name, pct, reset] = row.split("\t");
      if (group !== "Gemini Models" || !pct) continue;
      const key = /five/i.test(name) ? "QUOTA_5H" : /weekly/i.test(name) ? "QUOTA_WEEK" : null;
      if (!key) continue;
      const t = new Date(reset);
      const when = isNaN(t) ? reset : t.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
      lines.push(`${key}=${pct.trim()} remaining (resets ${when})`);
    }
    return lines;
  } catch {
    return [];
  }
}

function usage(agy) {
  const r = spawnSync(agy, ["-p", "/usage"], { encoding: "utf8", env: subscriptionEnv() });
  process.stdout.write(r.stdout || "");
  if (r.status !== 0) process.stderr.write(r.stderr || "");
  process.exit(r.status ?? 1);
}

function buildPrompt(userPrompt, refs) {
  const imagePaths = refs.length ? `ImagePaths=${JSON.stringify(refs)}` : "no ImagePaths";
  return `Call the built-in generate_image tool exactly once, with ${imagePaths}.

Pass the text between BEGIN PROMPT and END PROMPT to generate_image as the Prompt, unchanged.
Do not rewrite, expand, translate, or add creative details.
${refs.length ? "The attached images are references in the listed order (Image 1, Image 2, ...).\n" : ""}
BEGIN PROMPT
${userPrompt}
END PROMPT

Do not run shell commands. Do not create, move, or edit any files yourself.
Your final reply must contain only the exact absolute path of the generated image file.`;
}

async function generate(o) {
  if (!o.prompt) die("--prompt is required");
  const agy = findAgy();
  const cwd = process.cwd();

  const refs = o.refs.map((r) => path.resolve(cwd, r));
  for (const r of refs) {
    if (!existsSync(r)) die(`reference not found: ${r}`);
    if (!IMG_RE.test(r)) die(`reference must be PNG/JPEG/WebP: ${r}`);
  }

  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  let out = path.resolve(cwd, o.out || path.join("generated-images", `${slug(o.prompt)}-${ts}.png`));
  if (existsSync(out) && !o.overwrite) die(`output exists (use --overwrite): ${out}`);

  const args = [
    "-p", buildPrompt(o.prompt, refs),
    "--sandbox",
    "--disable-slash-commands",
    "--output-format", "stream-json",
    "--print-timeout", o.timeout,
  ];
  if (o.effort) args.push("--effort", o.effort);
  if (o.model) args.push("--model", o.model);
  const extraDirs = [...new Set(refs.map((r) => path.dirname(r)).filter((d) => !d.startsWith(cwd)))];
  for (const d of extraDirs) args.push("--add-dir", d);

  if (o.dryRun) {
    console.log(JSON.stringify({ agy, cwd, out, refs, args: args.map((a) => (a.length > 120 ? a.slice(0, 120) + "..." : a)) }, null, 2));
    return;
  }

  const started = Date.now() - 2000;
  const convIds = new Set();
  const warnings = [];
  let result = null;
  let buf = "";

  const child = spawn(agy, args, { cwd, env: subscriptionEnv(), stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  child.stdout.on("data", (d) => {
    buf += d;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (e.conversation_id) convIds.add(e.conversation_id);
      const s = e.step_update;
      if (s) {
        if (s.conversation_id) convIds.add(s.conversation_id);
        for (const sa of s.subagent_info?.subagents || []) if (sa.conversation_id) convIds.add(sa.conversation_id);
        // agy's own orchestration (subagents, schedule/wait, view_file of refs) is expected; flag side-effecting tools only.
        if (s.tool_name && s.state === "DONE" && RISKY_TOOL.test(s.tool_name))
          warnings.push(`unexpected tool used: ${s.tool_name}`);
      }
      if (e.event === "result") result = e.result;
    }
  });
  const code = await new Promise((res) => child.on("close", res));

  if (!result || result.status !== "SUCCESS") {
    const err = (result?.error || stderr || `agy exited ${code}`).slice(0, 800);
    if (/authentication required/i.test(err)) die("agy is not signed in. Run `agy` once interactively and sign in with Google.", 3);
    if (/quota|limit|RESOURCE_EXHAUSTED|429/i.test(err)) die(`subscription limit reached: ${err}`, 4);
    die(`generation failed: ${err}`);
  }

  // 1) path reported by the agent, 2) newest image in this run's brain dirs.
  let src = null;
  const m = (result.response || "").match(/(?:[A-Za-z]:[\\/]|\/)[^\s'"`]+\.(?:png|jpe?g|webp)/gi);
  if (m) src = m.reverse().find((p) => existsSync(p) && statSync(p).mtimeMs >= started) || null;
  if (!src) {
    const dirs = [...convIds].map((id) => path.join(BRAIN, id));
    src = newestImagesSince(dirs, started)[0] || null;
  }
  if (!src) {
    // The image model has its own cap, separate from the totals shown by /usage. agy still
    // exits 0, so look for the 429 text in this run's brain logs and report it clearly.
    for (const id of convIds) {
      const dir = path.join(BRAIN, id);
      const stack = [dir];
      while (stack.length) {
        const d = stack.pop();
        let entries = [];
        try { entries = readdirSync(d, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) { stack.push(p); continue; }
          try {
            if (statSync(p).size > 5e6) continue;
            const t = readFileSync(p, "utf8").match(/exhausted your capacity on this model[^"\\]*/i);
            if (t) die(`image model cap reached (separate from /usage totals): ${t[0].trim()}`, 4);
          } catch {}
        }
      }
    }
  }
  if (!src) die(`agy reported success but no new image file was found. Response: ${(result.response || "").slice(0, 300)}`);

  mkdirSync(path.dirname(out), { recursive: true });
  const srcExt = path.extname(src).toLowerCase().replace("jpeg", "jpg");
  const outExt = path.extname(out).toLowerCase().replace("jpeg", "jpg");
  if (srcExt === outExt) {
    copyFileSync(src, out);
  } else {
    const fmt = { ".png": "png", ".jpg": "jpeg", ".webp": "webp" }[outExt];
    if (!fmt) die(`unsupported output extension: ${outExt}`);
    const r = process.platform === "darwin"
      ? spawnSync("sips", ["-s", "format", fmt, src, "--out", out], { encoding: "utf8" })
      : { status: 1 }; // no converter outside macOS: fall back to the original format below
    if (r.status !== 0) {
      const fallback = out.replace(/\.[^.]+$/, srcExt);
      copyFileSync(src, fallback);
      out = fallback;
      warnings.push(`format conversion failed; saved original format to ${fallback}`);
    }
  }
  if (!existsSync(out)) die("output file was not written");

  for (const w of warnings) console.error(`WARNING: ${w}`);
  console.log(`PATH=${out}`);
  console.log(`SIZE=${dims(out)}`);
  console.log(`SOURCE=${src}`);
  console.log(`SECONDS=${Math.round(result.duration_seconds || 0)}`);
  console.log(`MARKDOWN=![${path.basename(out)}](${out})`);
  if (!o.noQuota) for (const l of quotaLines(agy)) console.log(l);
}

const o = parseArgs(process.argv.slice(2));
if (o.cmd === "usage") usage(findAgy());
else if (o.cmd === "generate") await generate(o);
else die(`unknown command: ${o.cmd} (use generate | usage)`);
