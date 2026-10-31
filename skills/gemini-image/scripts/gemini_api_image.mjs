// Paid fallback: Gemini API (Nano Banana 2) with the user's own API key. Use ONLY when agy hits its image cap (exit code 4).
//   node gemini_api_image.mjs --list-models                  free: checks the key and lists image models (prints no secrets)
//   node gemini_api_image.mjs generate --prompt "..." --out x.jpg [--ref a.jpg --ref b.jpg] [--size 1K|2K|4K] [--aspect 4:5] [--model <id>] [--yes]
// Without --yes it only prints the estimated cost and exits with code 2. Run with --yes only after the user approved that cost.
// Key lookup (first hit wins): $BANANOCLAUDE_ENV file, ~/.bananoclaude.env, then $GEMINI_API_KEY. The file holds one line: GEMINI_API_KEY=...
// The key is sent only as the x-goog-api-key header to generativelanguage.googleapis.com and is never printed.
// Each paid run is appended to ~/.bananoclaude-api-spend.log.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();
const HOST = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-3.1-flash-image";
const PRICE_USD = { "1K": 0.067, "2K": 0.101, "4K": 0.151 }; // estimates from third-party sources citing Google's pricing: verify
const SPEND_LOG = path.join(HOME, ".bananoclaude-api-spend.log");

function die(msg, code = 1) {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
}

function loadKey() {
  const files = [process.env.BANANOCLAUDE_ENV, path.join(HOME, ".bananoclaude.env")].filter(Boolean);
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const line = fs.readFileSync(f, "utf8").split(/\r?\n/).find((l) => /^\s*GEMINI_API_KEY\s*=/.test(l));
    const key = line ? line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "") : "";
    if (key) return key;
  }
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  die("no API key found. Put GEMINI_API_KEY=... in ~/.bananoclaude.env (or set BANANOCLAUDE_ENV to a file that has it).");
}

const redact = (s, key) => String(s).split(key).join("<key>");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const vals = (n) => argv.flatMap((a, i) => (a === n ? [argv[i + 1]] : []));

const key = loadKey();
const headers = { "x-goog-api-key": key, "content-type": "application/json" };

if (flag("--list-models")) {
  const r = await fetch(`${HOST}/models?pageSize=200`, { headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) die(`${r.status} ${redact(JSON.stringify(j).slice(0, 300), key)}`);
  const names = (j.models || []).map((m) => m.name.replace("models/", "")).filter((n) => /image|banana/i.test(n));
  console.log("KEY_OK");
  console.log("IMAGE_MODELS=" + (names.join(", ") || "(none listed)"));
  process.exit(0);
}

if (argv[0] !== "generate") die("usage: see the header of this file");
const prompt = val("--prompt");
const out = val("--out");
if (!prompt || !out) die("--prompt and --out are required");
const size = val("--size") || "1K";
const aspect = val("--aspect") || "4:5";
const model = val("--model") || DEFAULT_MODEL;
const refs = vals("--ref");
const est = PRICE_USD[size] ?? 0.1;

console.log(`MODEL=${model} SIZE=${size} ASPECT=${aspect} REFS=${refs.length} ESTIMATED_COST_USD=${est.toFixed(3)}`);
if (!flag("--yes")) {
  console.log("NOT RUN: this call is billed to the user's API key. Add --yes after the user approved the cost.");
  process.exit(2);
}

const mime = (f) => ({ ".png": "image/png", ".webp": "image/webp" }[path.extname(f).toLowerCase()] || "image/jpeg");
for (const f of refs) if (!fs.existsSync(f)) die(`reference image not found: ${f}`);
const parts = [{ text: prompt }, ...refs.map((f) => ({ inline_data: { mime_type: mime(f), data: fs.readFileSync(f).toString("base64") } }))];
const body = { contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect, imageSize: size } } };

const t0 = Date.now();
const r = await fetch(`${HOST}/models/${model}:generateContent`, { method: "POST", headers, body: JSON.stringify(body) });
const j = await r.json().catch(() => ({}));
if (!r.ok) die(`${r.status} ${redact(JSON.stringify(j).slice(0, 400), key)}`);
const img = (j.candidates?.[0]?.content?.parts || []).find((p) => (p.inlineData || p.inline_data)?.data);
if (!img) die(`no image in the response ${redact(JSON.stringify(j).slice(0, 300), key)}`);
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, Buffer.from((img.inlineData || img.inline_data).data, "base64"));
fs.appendFileSync(SPEND_LOG, `${new Date().toISOString()}\t${model}\t${size}\t${est}\t${out}\n`);
const spent = fs.readFileSync(SPEND_LOG, "utf8").trim().split("\n").reduce((s, l) => s + Number(l.split("\t")[3] || 0), 0);
console.log(`PATH=${path.resolve(out)}`);
console.log(`SECONDS=${Math.round((Date.now() - t0) / 1000)}`);
console.log(`SPENT_SO_FAR_USD(est)=${spent.toFixed(3)}`);
