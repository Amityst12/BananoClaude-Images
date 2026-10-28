// Runs INSIDE `aside repl` (Playwright-style `page` + `snapshot()`), in the user's own logged-in browser.
// Drives Gemini web (gemini.google.com) or Google Flow (flow.google.com). Pages are opened with ?hl=en,
// and every UI label is matched in English and Korean so other UI languages fall back gracefully.
// Every public function prints exactly one line: @@RESULT@@<json>.

const GEMINI_HOME = 'https://gemini.google.com/app?hl=en';
const FLOW_HOME = 'https://flow.google.com/?hl=en';

function __esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// L('Send message', '메시지 보내기') -> "(?:Send message|메시지 보내기)"
function L(...labels) { return '(?:' + labels.map(__esc).join('|') + ')'; }
const REF = '\\[ref=(e\\d+)\\]';
function R(role, label, extra = '') { return new RegExp(`${role} "${label}"${extra} ${REF}`); }

const T = {
  // shared
  account: /(?:Google Account|Google 계정): [^"(]*\(([^)@\s]+@[^)\s]+)\)/,
  // Gemini web
  gTools: L('Upload & tools', '업로드 및 도구'),
  gCreateVideo: L('Create video', '동영상 만들기'),
  gVideoOn: L('Deselect Videos', '동영상 선택 해제'),
  gAspect: L('Aspect ratio', '가로세로 비율'),
  gLandscape: L('Landscape (16:9)', '가로 모드(16:9)'),
  gPortrait: L('Portrait (9:16)', '세로 모드(9:16)'),
  gUpload: L('File upload', '파일 업로드'),
  gSend: L('Send message', '메시지 보내기'),
  gPrompt: L('Enter a prompt for Gemini', 'Gemini 프롬프트 입력'),
  gStop: L('Stop response', '대답 생성 중지'),
  gSaid: /Gemini said|Gemini의 응답/,
  gDismiss: L('Not now', 'No thanks', '나중에'),
  // Flow
  fNewProject: L('New project', '새 프로젝트'),
  fSettings: L('Settings trigger', '설정 트리거'),
  fTitle: L('Editable text', '수정 가능한 텍스트'),
  fAddIngr: L('Add ingredients to the prompt box', '프롬프트 상자에 소재 추가'),
  fUpload: L('Upload media', '미디어 업로드'),
  fAddToPrompt: L('Add to prompt', '프롬프트에 추가'),
  fIngredientBtn: L('Ingredient', '소재'),
  fVideo: L('Video', '동영상'),
  fIngredients: L('Ingredients', '소재'),
  fModel: L('Select model family', '모델 제품군 선택'),
  fGenerate: L('Start generation', '생성 시작'),
  fClearPrompt: L('Clear prompt', '프롬프트 지우기'),
  fRetry: L('Retry', 'Try again', '다시 시도'),
  fAccountBtn: L('Account details', '계정 세부정보'),
  fCost: /link "([\d,]+) (?:credits|크레딧)"/,
  fFlowCredits: /(?:"([\d,]+) Google Flow credits"|Google Flow 크레딧 ([\d,]+)개)/,
  fAiCredits: /"([\d,]+) (?:AI credits|AI 크레딧)"/,
  fWatermark: /Visible watermarking is required|워터마크 표시가 필수/,
  fFailed: /text: "(?:Failed|실패)[^"]*"/,
};
const MODEL_LABEL = { lite: 'Veo 3.1 - Lite', fast: 'Veo 3.1 - Fast', quality: 'Veo 3.1 - Quality', omni: 'Omni 1.1 Flash' };

function __out(o) { console.log('@@RESULT@@' + JSON.stringify(o)); }
function __ref(tree, re) { const m = tree.match(re); return m ? m[1] : null; }
async function __snap(p, full) { return (await snapshot(p, full ? {} : { interactive: true })).tree; }
async function __waitRef(p, re, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const tr = await __snap(p);
    const r = __ref(tr, re);
    if (r) return { r, tr };
    await sleep(700);
  }
  throw new Error('UI element not found (Google may have changed the page): ' + re);
}
async function __click(p, re, ms) { const { r } = await __waitRef(p, re, ms); await p.locator(r).click(); await sleep(400); }
// Menu items close their menu on click, which some drivers report as an error; callers re-check state.
async function __tryClick(p, re, ms = 5000) {
  let r = null;
  try { r = (await __waitRef(p, re, ms)).r; } catch (e) { return false; }
  try { await p.locator(r).click(); } catch (e) {}
  await sleep(600);
  return true;
}
function __account(tr) { return (tr.match(T.account) || [])[1] || null; }
function __progress(tr) {
  const m = tr.match(/generic "(\d{1,3})%"/) || tr.match(/text: "(\d{1,3})%/);
  return m ? Number(m[1]) : null;
}
async function __findTab(url) {
  const base = url.split('?')[0];
  for (const t of await listBrowserTabs()) {
    if (t.url && t.url.split('?')[0] === base) return await attachBrowserTab(t.targetId);
  }
  return await openTab(url.includes('?') ? url : url + '?hl=en');
}
async function __saveFromUrl(src, out) {
  const res = await fetch(src); // cookie-bearing fetch inside the user's browser session
  if (!res.ok) return { ok: false, status: 'failed', error: `download HTTP ${res.status}` };
  const buf = Buffer.from(await res.arrayBuffer());
  try {
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, buf);
    return { ok: true, status: 'done', saved: out, bytes: buf.length };
  } catch (e) {
    return { ok: true, status: 'done', b64: buf.toString('base64') };
  }
}

// ---------------------------------------------------------------- Gemini web
async function geminiSubmit(o) {
  const p = await openTab(GEMINI_HOME);
  await __waitRef(p, R('button', T.gTools), 40000);
  await sleep(1500);
  const account = __account(await __snap(p, true));
  if (o.expectAccount && account !== o.expectAccount) {
    __out({ ok: false, error: `account mismatch: signed in as ${account}, expected ${o.expectAccount}` });
    await closeTab(p); return;
  }
  await __tryClick(p, R('button', T.gDismiss), 1500);

  if (!R('button', T.gVideoOn).test(await __snap(p))) {
    await __click(p, R('button', T.gTools));
    await __tryClick(p, R('menuitemcheckbox', T.gCreateVideo));
    await __waitRef(p, R('button', T.gVideoOn), 10000);
  }

  const want = o.aspect === '9:16' ? T.gPortrait : T.gLandscape;
  const aspectSet = new RegExp(`button "${T.gAspect}, ${want}" ${REF}`);
  if (!aspectSet.test(await __snap(p))) {
    await __click(p, new RegExp(`button "${T.gAspect}[^"]*" ${REF}`));
    await __tryClick(p, R('menuitemradio', want));
    await __waitRef(p, aspectSet, 8000);
  }

  for (const file of (o.refs || []).slice(0, 1)) {
    const { r } = await __waitRef(p, R('button', T.gUpload));
    const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 15000 }), p.locator(r).click()]);
    await chooser.setFiles(file);
    await __waitRef(p, R('button', T.gSend), 60000);
    await sleep(1500);
  }

  const { r: box } = await __waitRef(p, R('textbox', T.gPrompt));
  await p.locator(box).click();
  await p.keyboard.type(o.prompt);
  await sleep(500);
  await __click(p, R('button', T.gSend));

  const t0 = Date.now();
  while (Date.now() - t0 < 30000 && !/\/app\/[0-9a-f]+/.test(p.url())) await sleep(1000);
  const chatUrl = p.url();
  const ok = /\/app\/[0-9a-f]+/.test(chatUrl);
  __out({ ok, error: ok ? undefined : 'chat did not start', chatUrl, account });
}

async function geminiPoll(o) {
  const p = await __findTab(o.chatUrl);
  const t0 = Date.now();
  while (Date.now() - t0 < (o.budgetMs || 90000)) {
    const vids = await p.evaluate(() => [...document.querySelectorAll('video')]
      .map((v) => v.currentSrc || v.src).filter((s) => s && s.startsWith('http')));
    if (vids.length) {
      __out(await __saveFromUrl(vids[vids.length - 1], o.out));
      if (o.close) await closeTab(p);
      return;
    }
    if (!R('button', T.gStop).test(await __snap(p))) {
      const parts = (await __snap(p, true)).split(T.gSaid);
      if (parts.length > 1) {
        const msg = (parts[parts.length - 1].match(/text: "([^"]+)"/) || [])[1] || '';
        if (msg && !/generating your video|video is ready|동영상을 (생성|만들)|준비/i.test(msg)) {
          __out({ ok: false, status: 'failed', error: msg }); return;
        }
      }
    }
    await sleep(5000);
  }
  __out({ ok: true, status: 'running' });
}

// ---------------------------------------------------------------- Google Flow
async function flowCredits() {
  const p = await openTab(FLOW_HOME);
  try {
    const { tr } = await __waitRef(p, R('button', T.fAccountBtn), 30000);
    await p.locator(__ref(tr, R('button', T.fAccountBtn))).click();
    const t0 = Date.now();
    let t2 = '';
    while (Date.now() - t0 < 15000) { t2 = await __snap(p); if (T.fFlowCredits.test(t2)) break; await sleep(700); }
    const fc = t2.match(T.fFlowCredits);
    const ac = t2.match(T.fAiCredits);
    __out({
      ok: !!fc,
      account: __account(tr),
      flowCredits: fc ? Number((fc[1] || fc[2]).replace(/,/g, '')) : null,
      aiCredits: ac ? Number(ac[1].replace(/,/g, '')) : null,
      watermarkForced: T.fWatermark.test(t2),
    });
  } finally { await closeTab(p); }
}

async function flowSubmit(o) {
  const p = await openTab(FLOW_HOME);
  let tr;
  ({ tr } = await __waitRef(p, R('button', T.fNewProject), 30000));
  const account = __account(tr);
  if (o.expectAccount && account !== o.expectAccount) {
    __out({ ok: false, error: `account mismatch: signed in as ${account}, expected ${o.expectAccount}` });
    await closeTab(p); return;
  }
  await p.locator(__ref(tr, R('button', T.fNewProject))).click();
  ({ tr } = await __waitRef(p, R('button', T.fSettings), 40000));
  const projectUrl = p.url();

  if (o.title) {
    const r = __ref(tr, R('textbox', T.fTitle));
    if (r) { await p.locator(r).fill(o.title); await p.keyboard.press('Enter'); await sleep(500); }
  }

  const ingrRe = new RegExp(`button "${T.fIngredientBtn}" \\[ref=`, 'g');
  for (const file of o.refs || []) {
    tr = await __snap(p);
    const before = (tr.match(ingrRe) || []).length;
    let up = __ref(tr, R('button', T.fUpload));
    if (!up) {
      await __click(p, R('button', T.fAddIngr));
      up = (await __waitRef(p, R('button', T.fUpload))).r;
    }
    const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 15000 }), p.locator(up).click()]);
    await chooser.setFiles(file);
    const base = file.split(/[\\/]/).pop();
    const opt = await __waitRef(p, new RegExp(`option "${__esc(base)} (?:Image|이미지)" ${REF}`), 90000);
    await p.locator(opt.r).click();
    const t1 = Date.now();
    while (Date.now() - t1 < 8000) {
      await sleep(600);
      const t = await __snap(p);
      const add = __ref(t, R('button', T.fAddToPrompt));
      if (add) { await p.locator(add).click(); await sleep(800); break; }
      if ((t.match(ingrRe) || []).length > before) break;
    }
    if (((await __snap(p)).match(ingrRe) || []).length <= before) throw new Error('reference uploaded but not attached: ' + base);
  }

  await __click(p, R('button', T.fSettings));
  await __click(p, R('radio', T.fVideo));
  await __click(p, R('radio', T.fIngredients));
  await __click(p, R('radio', __esc(o.aspect)));
  const label = MODEL_LABEL[o.model];
  if (!label) throw new Error('unknown model ' + o.model);
  tr = await __snap(p);
  if (!new RegExp(`button "${T.fModel}" ${REF}: "${__esc(label)}"`).test(tr)) {
    await __click(p, R('button', T.fModel));
    await __click(p, R('menuitem', __esc(label)));
  }
  if (o.duration) {
    const r = __ref(await __snap(p), new RegExp(`radio "${o.duration}(?:s|초)" ${REF}`));
    if (r) { await p.locator(r).click(); await sleep(400); }
  }
  if (o.resolution) {
    const r = __ref(await __snap(p), new RegExp(`radio "${__esc(o.resolution)}" ${REF}`)) ||
      __ref(await __snap(p, true), new RegExp(`radio ${REF}:\\s*\\n\\s*- text: "${__esc(o.resolution)}"`));
    if (r) { await p.locator(r).click(); await sleep(400); }
  }
  await __click(p, R('radio', 'x1'));
  tr = await __snap(p);
  const cm = tr.match(T.fCost);
  const credits = cm ? Number(cm[1].replace(/,/g, '')) : NaN;
  const settings = (tr.match(new RegExp(`button "${T.fSettings}" \\[ref=e\\d+\\][^:]*: "([^"]+)"`)) || [])[1];
  await p.keyboard.press('Escape');
  await sleep(400);

  if (!Number.isFinite(credits)) { __out({ ok: false, error: 'could not read credit cost', projectUrl }); return; }
  if (credits > o.maxCredits) {
    __out({ ok: false, error: `cost ${credits} credits exceeds --max-credits ${o.maxCredits}`, credits, projectUrl });
    return;
  }

  tr = await __snap(p);
  const box = __ref(tr, new RegExp(`textbox(?: "[^"]*")? ${REF}[^\\n]*\\n\\s*- button "${T.fAddIngr}"`));
  if (!box) { __out({ ok: false, error: 'prompt box not found', projectUrl }); return; }
  await p.locator(box).click();
  await p.keyboard.type(o.prompt);
  await sleep(500);

  tr = await __snap(p);
  if (new RegExp(`button "${T.fGenerate}" \\[ref=e\\d+\\] \\[disabled\\]`).test(tr)) {
    __out({ ok: false, error: 'generate button disabled', projectUrl }); return;
  }
  await __click(p, R('button', T.fGenerate));

  const t0 = Date.now();
  let started = false;
  while (Date.now() - t0 < 45000) {
    await sleep(1500);
    const t = await __snap(p);
    const cleared = !R('button', T.fClearPrompt).test(t) &&
      new RegExp(`textbox ${REF}[^\\n]*\\n\\s*- button "${T.fAddIngr}"`).test(t);
    if (__progress(t) !== null || T.fFailed.test(t) || cleared) { started = true; break; }
  }
  __out({ ok: started, error: started ? undefined : 'generation did not start', projectUrl, account, credits, settings });
}

async function flowPoll(o) {
  const p = await __findTab(o.projectUrl);
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < (o.budgetMs || 90000)) {
    const tr = await __snap(p);
    if (T.fFailed.test(tr)) {
      const msg = ((tr.match(T.fFailed) || [''])[0]).replace(/^text: "|"$/g, '').replace(/\s+/g, ' ').trim();
      if (o.retry) {
        const r = __ref(tr, R('button', T.fRetry));
        if (r) { await p.locator(r).click(); __out({ ok: true, status: 'retried', error: msg }); return; }
      }
      __out({ ok: false, status: 'failed', error: msg });
      return;
    }
    last = __progress(tr);
    if (last === null) {
      // Finished tiles show a thumbnail; the <video> (signed CDN URL) only mounts on hover.
      const thumbs = p.locator('img[src*="flow-content.google/image"]');
      const n = await thumbs.count();
      for (let i = 0; i < n; i++) { try { await thumbs.nth(i).hover({ timeout: 3000 }); await sleep(1200); } catch (e) {} }
      const srcs = await p.evaluate(() => [...document.querySelectorAll('video')]
        .map((v) => v.currentSrc || v.src).filter((s) => s && s.startsWith('http')));
      const uniq = [...new Map(srcs.map((s) => [s.split('?')[0], s])).values()];
      if (uniq.length) {
        __out({ ok: true, status: 'done', videos: uniq.map((src) => ({ src })) });
        if (o.close) await closeTab(p);
        return;
      }
    }
    await sleep(5000);
  }
  __out({ ok: true, status: 'running', progress: last });
}
