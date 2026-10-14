/**
 * Strict production playback test — real Chrome, real decoded frames.
 *
 *   node tests/e2e/prod-playback.mjs                 # RUNS=20 by default
 *   RUNS=1 PLAY_SEC=60 node tests/e2e/prod-playback.mjs
 *   MODE=binge EPISODES=1-16 URL=... node tests/e2e/prod-playback.mjs
 *
 * A run passes only if, in a fresh browser context:
 *   1. the <video> reaches readyState>=2 with videoWidth>0 (first decoded frame),
 *   2. decoded frame count (getVideoPlaybackQuality) keeps increasing,
 *   3. currentTime advances >= 0.8 * PLAY_SEC over PLAY_SEC of wall time with no stall > STALL_SEC,
 *   4. seek forward and backward both land and keep playing,
 *   5. pause holds the clock still, resume moves it again,
 *   6. a reload restores the saved position (Continue Watching), within 15s.
 * Results are appended as JSON lines to OUT.
 */
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';

const URL0 = process.env.URL ?? 'https://anifoxwatch.web.app/watch/anime/you-and-i-are-polar-opposites-season-2-210031?lang=sub&ep=1&s=2';
const RUNS = +(process.env.RUNS ?? 20);
const PLAY_SEC = +(process.env.PLAY_SEC ?? 60);
const STALL_SEC = +(process.env.STALL_SEC ?? 3);
const MODE = process.env.MODE ?? 'full';
const OUT = process.env.OUT ?? '.artifacts/production-acceptance.jsonl';
const HEADLESS = process.env.HEADED ? false : true;
const API = process.env.API ?? 'https://poor-marne-sssssenko-05a416b4.koyeb.app';

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = (page) => page.evaluate(() => {
  const v = document.querySelector('video');
  if (!v) return { video: false, text: document.body.innerText.slice(0, 200) };
  const q = v.getVideoPlaybackQuality?.();
  return {
    video: true, rs: v.readyState, t: v.currentTime, w: v.videoWidth, h: v.videoHeight,
    paused: v.paused, ended: v.ended, dur: v.duration, frames: q?.totalVideoFrames ?? -1,
    dropped: q?.droppedVideoFrames ?? -1, err: v.error?.code ?? null, src: (v.currentSrc || '').slice(0, 90),
  };
}).catch((e) => ({ video: false, evalError: e.message.slice(0, 100) }));

async function waitFirstFrame(page, timeout) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeout) {
    const s = await state(page);
    if (s.video && s.rs >= 2 && s.w > 0 && s.t > 0 && s.frames > 0) return { ok: true, ms: performance.now() - t0, s };
    if (!s.video && /No source for this episode|couldn.t load|Stream unavailable/i.test(s.text ?? '')) return { ok: false, ms: performance.now() - t0, s, why: 'error-ui' };
    await sleep(100);
  }
  return { ok: false, ms: timeout, s: await state(page), why: 'timeout' };
}

const play = (page) => page.evaluate(() => { const v = document.querySelector('video'); v.muted = true; return v.play().then(() => true, (e) => e.message); });

/** Watches the clock for `sec` seconds; returns advance, max stall and frame delta. */
async function observe(page, sec) {
  const a = await state(page);
  let last = a, lastMove = performance.now(), maxStall = 0;
  const end = performance.now() + sec * 1000;
  while (performance.now() < end) {
    await sleep(1000);
    const s = await state(page);
    if (!s.video) return { ok: false, why: 'video vanished', s };
    if (s.t > last.t + 0.05) lastMove = performance.now();
    maxStall = Math.max(maxStall, (performance.now() - lastMove) / 1000);
    last = s;
  }
  return { advance: +(last.t - a.t).toFixed(2), frames: last.frames - a.frames, maxStall: +maxStall.toFixed(1), from: a.t, to: last.t, end: last };
}

async function seekTo(page, t) {
  await page.evaluate((x) => { document.querySelector('video').currentTime = x; }, t);
  const t0 = performance.now();
  while (performance.now() - t0 < 30_000) {
    await sleep(250);
    const s = await state(page);
    if (s.video && Math.abs(s.t - t) < 20 && s.rs >= 3 && !s.paused) {
      const o = await observe(page, 5);
      return { ok: o.advance >= 2.5 && o.frames > 0, ms: performance.now() - t0, ...o };
    }
  }
  return { ok: false, ms: 30_000, s: await state(page) };
}

function trackNet(page, r) {
  const started = new WeakMap();
  page.on('request', (req) => started.set(req, performance.now()));
  page.on('requestfinished', async (req) => {
    const u = req.url();
    if (!/\/api\/stream\//.test(u)) return;
    const res = await req.response().catch(() => null);
    if (r.api.length < 250) r.api.push({ u: u.replace(/^https?:\/\/[^/]+/, '').slice(0, 300), st: res?.status(), ms: Math.round(req.timing().responseEnd) });
  });
  page.on('response', (res) => {
    const st = res.status();
    if (st >= 400 && !/google|analytics|firebase|favicon/.test(res.url())) r.httpErr.push(`${st} ${res.url().slice(0, 120)}`);
  });
  page.on('requestfailed', (req) => {
    const f = req.failure()?.errorText ?? '';
    if (!/ERR_ABORTED/.test(f)) r.netFail.push(`${f} ${req.url().slice(0, 120)}`);
    const ms = performance.now() - (started.get(req) ?? performance.now());
    if (req.url().includes('/api/stream/') && ms > 500) {
      r.failedRequests ??= [];
      r.failedRequests.push({ ms, error: f, url: req.url() });
      if (r.failedRequests.length > 40) r.failedRequests.shift();
    }
  });
  page.on('pageerror', (e) => r.pageErr.push(e.message.slice(0, 160)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    r.console ??= [];
    r.console.push(msg.text().slice(0, 400));
    if (r.console.length > 40) r.console.shift();
  });
}

async function healthSample() {
  const started = performance.now();
  try {
    const response = await fetch(`${API}/health`, { signal: AbortSignal.timeout(10_000) });
    const health = await response.json();
    return { at: new Date().toISOString(), ms: performance.now() - started, httpStatus: response.status, ...health };
  } catch (error) { return { at: new Date().toISOString(), ms: performance.now() - started, error: error.message }; }
}

async function fullRun(browser, n) {
  const r = { run: n, at: new Date().toISOString(), url: URL0, api: [], httpErr: [], netFail: [], pageErr: [], steps: {} };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  trackNet(page, r);
  r.health = [await healthSample()];
  let sampling = null;
  const healthTimer = setInterval(() => {
    if (sampling) return;
    sampling = healthSample().then(sample => r.health.push(sample)).finally(() => { sampling = null; });
  }, 10_000);
  try {
    const t0 = performance.now();
    await page.goto(URL0, { waitUntil: 'commit', timeout: 45_000 });
    const ff = await waitFirstFrame(page, 90_000);
    r.firstFrameMs = performance.now() - t0;
    r.steps.firstFrame = ff;
    if (!ff.ok) throw new Error(`no first frame (${ff.why}) ${JSON.stringify(ff.s)}`);
    log(`run ${n}: first decoded frame ${r.firstFrameMs}ms; observing ${PLAY_SEC}s playback`);
    await play(page);

    const o = await observe(page, PLAY_SEC);
    r.steps.play = o;
    if (!(o.advance >= PLAY_SEC * 0.8 && o.frames > PLAY_SEC * 10 && o.maxStall <= STALL_SEC))
      throw new Error(`playback unhealthy ${JSON.stringify(o)}`);
    log(`run ${n}: ${o.advance}s advanced, ${o.frames} frames, ${o.maxStall}s max stall; checking seeks and resume`);

    const dur = o.end.dur > 0 && isFinite(o.end.dur) ? o.end.dur : 1400;
    const fwd = Math.min(dur - 60, o.end.t + 300);
    r.steps.seekFwd = await seekTo(page, fwd);
    if (!r.steps.seekFwd.ok) throw new Error(`seek forward failed ${JSON.stringify(r.steps.seekFwd)}`);
    r.steps.seekBack = await seekTo(page, 20);
    if (!r.steps.seekBack.ok) throw new Error(`seek back failed ${JSON.stringify(r.steps.seekBack)}`);

    await page.evaluate(() => document.querySelector('video').pause());
    const p1 = await state(page); await sleep(3000); const p2 = await state(page);
    await play(page);
    const after = await observe(page, 5);
    r.steps.pauseResume = { held: +(p2.t - p1.t).toFixed(2), resumedAdvance: after.advance };
    if (Math.abs(p2.t - p1.t) > 0.3 || after.advance < 2.5) throw new Error(`pause/resume failed ${JSON.stringify(r.steps.pauseResume)}`);

    // Continue Watching: move to a distinctive spot, let the app persist it, reload.
    const target = Math.min(dur - 90, 240);
    const resumeSeek = await seekTo(page, target);
    r.steps.resumeSeek = resumeSeek;
    if (!resumeSeek.ok) throw new Error(`seek to resume position failed ${JSON.stringify(resumeSeek)}`);
    await sleep(6000);
    const before = await state(page);
    await page.evaluate(() => document.querySelector('video').pause());
    await sleep(1500);
    const saved = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/video-position|watch_history/.test(k)) out[k] = localStorage.getItem(k).slice(0, 200); }
      return out;
    });
    const t1 = performance.now();
    await page.reload({ waitUntil: 'commit' });
    const rf = await waitFirstFrame(page, 90_000);
    const rs = await state(page);
    r.steps.resume = { savedNear: before.t, resumedAt: rs.t ?? null, ms: performance.now() - t1, keys: Object.keys(saved), firstFrame: rf };
    if (!rf.ok || Math.abs(rs.t - before.t) > 20) throw new Error(`resume failed ${JSON.stringify(r.steps.resume)} saved=${JSON.stringify(saved)}`);
    r.pass = true;
  } catch (e) {
    r.pass = false;
    r.failure = e.message.slice(0, 600);
    await page.screenshot({ path: `prod-fail-${n}.png` }).catch(() => {});
  } finally {
    clearInterval(healthTimer);
    if (sampling) await sampling;
    r.health.push(await healthSample());
    if (r.pass && r.health.some(sample => sample.httpStatus !== 200)) {
      r.pass = false;
      r.failure = 'API health request failed during playback';
    }
    await ctx.close();
  }
  return r;
}

function parseRange(s) { const [a, b] = s.split('-').map(Number); return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i); }

async function binge(browser) {
  const eps = parseRange(process.env.EPISODES ?? '1-16');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const r = { mode: 'binge', at: new Date().toISOString(), api: [], httpErr: [], netFail: [], pageErr: [], eps: [] };
  trackNet(page, r);
  for (const ep of eps) {
    const u = new URL(URL0); u.searchParams.set('ep', String(ep));
    const t0 = performance.now();
    const e = { ep };
    try {
      if (ep === eps[0]) await page.goto(u.toString(), { waitUntil: 'commit' });
      else {
        // Navigate like a viewer: the in-app episode button when present, the URL otherwise.
        const btn = page.getByRole('button', { name: 'Next', exact: true }).first();
        if (await btn.count() && !(await btn.isDisabled())) {
          const oldVideo = await page.$('video');
          await btn.click(); e.via = 'next-button';
          await page.waitForFunction((n) => Number(new URLSearchParams(location.search).get('ep')) === n, ep, { timeout: 20_000 });
          if (oldVideo) {
            await page.waitForFunction((v) => !v.isConnected, oldVideo, { timeout: 20_000 });
            await oldVideo.dispose();
          }
        } else { throw new Error('Next episode button unavailable; no transition simulated'); }
        await page.waitForFunction(() => { const v = document.querySelector('video'); return !v || v.currentTime < 5; }, null, { timeout: 20_000 }).catch(() => {});
      }
      const ff = await waitFirstFrame(page, 90_000);
      e.firstFrameMs = performance.now() - t0;
      if (!ff.ok) { e.pass = false; e.failure = `${ff.why} ${JSON.stringify(ff.s).slice(0, 300)}`; }
      else { await play(page); const o = await observe(page, +(process.env.EP_SEC ?? 15)); e.advance = o.advance; e.frames = o.frames; e.maxStall = o.maxStall; e.pass = o.advance >= 10 && o.frames > 100; }
    } catch (err) { e.pass = false; e.failure = err.message.slice(0, 300); }
    e.mem = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null).catch(() => null);
    log(`  ep${ep} ${e.pass ? 'PASS' : 'FAIL'} frame=${e.firstFrameMs}ms adv=${e.advance} via=${e.via ?? 'goto'} ${e.failure ?? ''}`);
    r.eps.push(e);
  }
  await ctx.close();
  return r;
}

const main = async () => {
  const browser = await chromium.launch({ channel: process.env.CHANNEL ?? 'chrome', headless: HEADLESS, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  if (MODE === 'binge') {
    const r = await binge(browser);
    appendFileSync(OUT, JSON.stringify(r) + '\n');
    log(`binge ${r.eps.filter((e) => e.pass).length}/${r.eps.length}`);
    if (r.eps.some(e => !e.pass)) process.exitCode = 1;
  } else {
    let streak = 0, passed = 0, attempted = 0;
    for (let n = 1; n <= RUNS; n++) {
      const r = await fullRun(browser, n);
      attempted++;
      appendFileSync(OUT, JSON.stringify(r) + '\n');
      streak = r.pass ? streak + 1 : 0; passed += r.pass ? 1 : 0;
      const s = r.steps;
      log(`run ${n} ${r.pass ? 'PASS' : 'FAIL'} ttff=${r.firstFrameMs}ms play=${s.play?.advance}s/${PLAY_SEC} stall=${s.play?.maxStall}s seekF=${s.seekFwd?.ms}ms seekB=${s.seekBack?.ms}ms resume=${s.resume?.savedNear}->${s.resume?.resumedAt} api=${JSON.stringify(r.api.map((a) => [a.st, a.ms]))} streak=${streak}${r.failure ? `\n    FAIL: ${r.failure}` : ''}${r.httpErr.length ? `\n    http: ${r.httpErr.slice(0, 5).join(' | ')}` : ''}`);
      if (!r.pass && process.env.CONTINUE_ON_FAILURE !== '1') break;
    }
    log(`${passed}/${attempted} attempted passed, final streak ${streak}, required ${RUNS}`);
    if (streak < RUNS) process.exitCode = 1;
  }
  await browser.close();
};
main().catch((error) => { console.error(error); process.exitCode = 1; });
