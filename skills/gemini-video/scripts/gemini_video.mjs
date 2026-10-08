#!/usr/bin/env node
// gemini-video bridge: Claude Code -> `aside repl` -> user's logged-in Google Flow (flow.google.com) -> Veo / Omni video.
// Uses the Google AI plan's Flow credits (then Google AI credits). No API key, no cookie export.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = readFileSync(path.join(HERE, "browser_lib.js"), "utf8");
const HOME = os.homedir();
const MODELS = ["lite", "fast", "quality", "omni"];

function die(msg, code = 1) { console.error(`ERROR: ${msg}`); process.exit(code); }
function info(msg) { console.error(`[gemini-video] ${msg}`); }

function parseArgs(argv) {
  const o = { refs: [], backend: "gemini", model: "lite", aspect: "16:9", maxCredits: 20, timeoutMin: 10, retry: 1 };
  o.cmd = argv[0] && !argv[0].startsWith("--") ? argv.shift() : "generate";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => { if (i + 1 >= argv.length) die(`${a} needs a value`); return argv[++i]; };
    if (a === "--prompt") o.prompt = v();
    else if (a === "--ref" || a === "--reference") o.refs.push(v());
    else if (a === "--backend") o.backend = v();
    else if (a === "--model") o.model = v();
    else if (a === "--aspect") o.aspect = v();
    else if (a === "--duration") o.duration = Number(v());
    else if (a === "--resolution") o.resolution = v();
    else if (a === "--max-credits") o.maxCredits = Number(v());
    else if (a === "--out") o.out = v();
    else if (a === "--title") o.title = v();
    else if (a === "--project") o.project = v();
    else if (a === "--account") o.account = v();
    else if (a === "--expect-account") o.expectAccount = v();
    else if (a === "--timeout-min") o.timeoutMin = Number(v());
    else if (a === "--no-retry") o.retry = 0;
    else die(`unknown argument: ${a}`);
  }
  return o;
}

function asideBin() {
  for (const c of [process.env.ASIDE_BIN, path.join(HOME, ".local", "bin", "aside"), "/opt/homebrew/bin/aside", "/usr/local/bin/aside"]) {
    if (c && existsSync(c)) return c;
  }
  const w = spawnSync("which", ["aside"], { encoding: "utf8" });
  if (w.status === 0 && w.stdout.trim()) return w.stdout.trim();
  die("aside CLI not found. Install Aside and its CLI first.", 3);
}

function repl(o, call, params) {
  // Function-scoped so repeated calls in a persistent REPL never collide on const declarations.
  const code = `await (async () => {\n${LIB}\nawait ${call}(${JSON.stringify(params)});\n})();`;
  const args = ["repl"];
  if (o.account) args.push("--account", o.account);
  args.push(code);
  const r = spawnSync(asideBin(), args, { encoding: "utf8", timeout: 170000, maxBuffer: 32 * 1024 * 1024 });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  const line = out.split("\n").reverse().find((l) => l.includes("@@RESULT@@"));
  if (!line) {
    if (/isn't running/i.test(out)) die("Aside is not running. Open the Aside browser and retry.", 3);
    die(`aside repl returned no result (exit ${r.status}${r.signal ? ", " + r.signal : ""}):\n${out.trim().slice(-1500)}`);
  }
  return JSON.parse(line.slice(line.indexOf("@@RESULT@@") + 10));
}

function slug(s) {
  return (s || "video").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "video";
}

function probe(file) {
  for (const ff of ["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe", "ffprobe"]) {
    const r = spawnSync(ff, ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "compact", file], { encoding: "utf8" });
    if (r.status === 0) {
      const w = r.stdout.match(/width=(\d+)/)?.[1], h = r.stdout.match(/height=(\d+)/)?.[1];
      const d = r.stdout.match(/duration=([\d.]+)/)?.[1];
      return { size: w && h ? `${w}x${h}` : "unknown", duration: d ? Number(d) : null, audio: /codec_type=audio/.test(r.stdout) };
    }
  }
  return null;
}

async function download(url, out) {
  const res = await fetch(url);
  if (!res.ok) die(`download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, buf);
  if (statSync(out).size < 1000) die("downloaded file is suspiciously small");
}

async function waitAndDownload(o, projectUrl, out) {
  const deadline = Date.now() + o.timeoutMin * 60000;
  let retries = o.retry;
  while (Date.now() < deadline) {
    const r = repl(o, "flowPoll", { projectUrl, budgetMs: 100000, retry: retries > 0, close: true });
    if (r.status === "retried") { retries--; info(`generation failed (${r.error}); Flow refunds failed runs. Retrying once.`); continue; }
    if (r.status === "failed") die(`generation failed: ${r.error}. PROJECT=${projectUrl}`, 5);
    if (r.status === "done") {
      const vids = r.videos || [];
      const outs = vids.map((v, i) => (vids.length === 1 ? out : out.replace(/(\.[^.]+)$/, `-${i + 1}$1`)));
      for (let i = 0; i < vids.length; i++) {
        await download(vids[i].src, outs[i]);
        const p = probe(outs[i]);
        console.log(`PATH=${outs[i]}`);
        if (p) console.log(`SIZE=${p.size}\nDURATION=${p.duration}\nAUDIO=${p.audio}`);
      }
      console.log(`PROJECT=${projectUrl}`);
      return;
    }
    info(`still generating${r.progress != null ? ` (${r.progress}%)` : ""}...`);
  }
  die(`timed out after ${o.timeoutMin} min. Resume with: poll --project ${projectUrl} --out ${out}`, 6);
}

async function geminiWait(o, chatUrl, out) {
  const deadline = Date.now() + o.timeoutMin * 60000;
  while (Date.now() < deadline) {
    const r = repl(o, "geminiPoll", { chatUrl, out, budgetMs: 100000, close: true });
    if (r.status === "failed") die(`Gemini did not produce a video: ${r.error}. CHAT=${chatUrl}`, 5);
    if (r.status === "done") {
      if (r.b64) { mkdirSync(path.dirname(out), { recursive: true }); writeFileSync(out, Buffer.from(r.b64, "base64")); }
      if (!existsSync(out) || statSync(out).size < 1000) die("video file missing after download");
      const p = probe(out);
      console.log(`PATH=${out}`);
      if (p) console.log(`SIZE=${p.size}\nDURATION=${p.duration}\nAUDIO=${p.audio}`);
      console.log(`CHAT=${chatUrl}`);
      return;
    }
    info("still generating...");
  }
  die(`timed out after ${o.timeoutMin} min. Resume with: poll --project ${chatUrl} --out ${out}`, 6);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  if (o.cmd === "credits") {
    const r = repl(o, "flowCredits", {});
    if (!r.ok) die(r.error || "could not read credits");
    console.log(`ACCOUNT=${r.account}\nFLOW_CREDITS=${r.flowCredits}\nAI_CREDITS=${r.aiCredits}\nWATERMARK_FORCED=${r.watermarkForced}`);
    return;
  }

  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const out = path.resolve(cwd, o.out || path.join("generated-videos", `${slug(o.prompt)}-${ts}.mp4`));
  if (existsSync(out)) die(`output exists: ${out}`);

  if (o.cmd === "poll") {
    if (!o.project) die("--project URL is required for poll");
    if (o.project.includes("gemini.google.com")) await geminiWait(o, o.project, out);
    else await waitAndDownload(o, o.project, out);
    return;
  }
  if (o.cmd !== "generate") die(`unknown command ${o.cmd} (generate | poll | credits)`);

  if (!o.prompt) die("--prompt is required");
  if (!["gemini", "flow"].includes(o.backend)) die("--backend must be gemini or flow");
  if (!MODELS.includes(o.model)) die(`--model must be one of ${MODELS.join(", ")}`);
  if (!["16:9", "9:16"].includes(o.aspect)) die("--aspect must be 16:9 or 9:16");
  if (o.refs.length > 3) die("at most 3 reference images");
  const refs = o.refs.map((r) => path.resolve(cwd, r));
  for (const r of refs) {
    if (!existsSync(r)) die(`reference not found: ${r}`);
    if (!/\.(png|jpe?g|webp)$/i.test(r)) die(`reference must be PNG/JPEG/WebP: ${r}`);
  }

  if (o.backend === "gemini") {
    if (refs.length > 1) die("Gemini web video accepts one reference image; use --backend flow for up to 3");
    info(`submitting to Gemini web (aspect=${o.aspect}, refs=${refs.length})`);
    const g = repl(o, "geminiSubmit", { prompt: o.prompt, refs, aspect: o.aspect, expectAccount: o.expectAccount });
    if (!g.ok) die(g.error || "Gemini submit failed");
    info(`started: ${g.chatUrl} | account ${g.account}`);
    await geminiWait(o, g.chatUrl, out);
    return;
  }

  info(`submitting to Flow (model=${o.model}, aspect=${o.aspect}, refs=${refs.length}, max-credits=${o.maxCredits})`);
  const s = repl(o, "flowSubmit", {
    prompt: o.prompt, refs, model: o.model, aspect: o.aspect, duration: o.duration, resolution: o.resolution,
    maxCredits: o.maxCredits, title: o.title || `gemini-video ${ts}`, expectAccount: o.expectAccount,
  });
  if (!s.ok) die(`${s.error}${s.projectUrl ? ` PROJECT=${s.projectUrl}` : ""}`, s.error?.includes("exceeds") ? 7 : 1);
  info(`started: ${s.settings} | ${s.credits} credits | account ${s.account}`);
  console.log(`CREDITS=${s.credits}`);
  await waitAndDownload(o, s.projectUrl, out);
}

main().catch((e) => die(e.stack || String(e)));
