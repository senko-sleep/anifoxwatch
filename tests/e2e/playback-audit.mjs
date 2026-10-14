/**
 * Playback audit: real sources, real browser, timed.
 *
 *   node tests/e2e/playback-audit.mjs                     # local dev stack (:8081 / :3001)
 *   E2E_WEB=https://anifoxwatch.web.app \
 *   E2E_API=https://poor-marne-sssssenko-05a416b4.koyeb.app node tests/e2e/playback-audit.mjs
 *
 * For each anime in AUDIT_SAMPLE (or the built-in sample) it measures:
 *   details   — title page opened → title + poster painted
 *   episodes  — title page opened → episode list rendered
 *   toFrame   — episode clicked → first decoded video frame (includes the stream resolver)
 *   resolver  — the /api/stream/watch request alone
 *   switch    — next episode clicked on the watch page → its first frame
 *   playing   — the video advances ≥ 6s over 10s of wall time
 *   resume    — Continue Watching reopens at the saved second, with a captured frame as its card
 *   images    — no <img> on the title page or home page failed to load
 *
 * Writes a JSON report to AUDIT_OUT (default: ./playback-audit-<host>.json).
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const WEB = (process.env.E2E_WEB ?? 'http://localhost:8081').replace(/\/$/, '');
const API = (process.env.E2E_API ?? 'http://localhost:3001').replace(/\/$/, '');
const OUT = process.env.AUDIT_OUT ?? `playback-audit-${new URL(WEB).host.replace(/[^\w]/g, '_')}.json`;
const ONLY = process.env.AUDIT_ONLY?.split(',').map(Number);

const DEFAULT_SAMPLE = [
  { id: 99423, title: 'DARLING in the FRANXX' },
  { id: 182255, title: 'Frieren: Beyond Journey’s End Season 2' },
  { id: 20807, title: 'Prison School' },
  { id: 20954, title: 'A Silent Voice' },
  { id: 104276, title: 'My Hero Academia Season 4' },
  { id: 139630, title: 'My Hero Academia Season 6' },
  { id: 9253, title: 'Steins;Gate' },
  { id: 47, title: 'Akira' },
  { id: 11617, title: 'High School DxD' },
  { id: 20661, title: 'Terror in Resonance' },
];
const SAMPLE = (process.env.AUDIT_SAMPLE ? JSON.parse(process.env.AUDIT_SAMPLE) : DEFAULT_SAMPLE)
  .filter((a) => !ONLY || ONLY.includes(a.id));

const slugOf = ({ id, title }) =>
  `${title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')}-${id}`;

const RESUME_AT = 90;

const ms = (t0) => Math.round(performance.now() - t0);
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

/** Resolves when the player shows a decoded frame (or an embed iframe), or reports why not. */
async function waitForFrame(page, timeout = 60_000) {
  return page.waitForFunction(() => {
    const v = document.querySelector('video');
    if (v && v.readyState >= 2 && v.currentTime > 0 && v.videoWidth > 0) return 'video';
    if (document.querySelector('iframe[src^="http"]')) return 'embed';
    if (/No source for this episode|couldn.t load|Stream unavailable/i.test(document.body.innerText)) return 'error';
    return false;
  }, null, { timeout, polling: 50 }).then((h) => h.jsonValue(), () => 'timeout');
}

async function brokenImages(page) {
  // Walk the page so lazy images get a chance to load, then come back up.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2_500);
  return page.evaluate(() => [...document.images]
    .filter((img) => img.currentSrc && img.complete && img.naturalWidth === 0)
    .map((img) => img.currentSrc.slice(0, 140)));
}

function trackStreams(page) {
  const calls = [];
  page.on('requestfinished', async (req) => {
    if (!req.url().includes('/api/stream/watch/')) return;
    const t = req.timing();
    const res = await req.response();
    let body = null;
    try { body = await res.json(); } catch {}
    calls.push({
      url: req.url(),
      startedAt: t.startTime,
      status: res?.status(),
      ms: Math.round(t.responseEnd),
      source: body?.source,
      category: body?.category,
      dubFallback: body?.dubFallback,
      sources: body?.sources?.length ?? 0,
    });
  });
  page.on('requestfailed', (req) => {
    if (req.url().includes('/api/stream/watch/')) calls.push({ url: req.url(), status: 'failed', error: req.failure()?.errorText });
  });
  return calls;
}

async function auditOne(browser, anime, lang) {
  const slug = slugOf(anime);
  const r = { anime: anime.title, id: anime.id, lang, slug, errors: [] };
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const streams = trackStreams(page);
  page.on('pageerror', (e) => r.errors.push(`pageerror: ${e.message.slice(0, 160)}`));

  try {
    // ── Title page ───────────────────────────────────────────────────────────
    let t0 = performance.now();
    await page.goto(`${WEB}/anime/${slug}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => {
      const h1 = document.querySelector('h1');
      const poster = document.querySelector('.title-poster img, aside img');
      return h1?.textContent?.trim() && poster?.complete && poster.naturalWidth > 0;
    }, null, { timeout: 45_000, polling: 50 });
    r.detailsMs = ms(t0);
    const firstEp = page.locator('.title-ep-list a[href*="/watch/"]').first();
    await firstEp.waitFor({ timeout: 45_000 });
    r.episodesMs = ms(t0);
    r.episodeCount = await page.locator('.title-ep-list a[href*="/watch/"]').count();
    r.brokenTitleImages = await brokenImages(page);

    // ── Episode 1 → first frame ──────────────────────────────────────────────
    t0 = performance.now();
    const clickedAt = Date.now();
    if (lang === 'sub') {
      await firstEp.click();
    } else {
      // The title page links play the default audio; dub is a URL choice on the watch page.
      const href = await firstEp.getAttribute('href');
      const u = new URL(href, WEB); u.searchParams.set('lang', 'dub');
      await page.goto(u.toString(), { waitUntil: 'commit' });
    }
    const kind = await waitForFrame(page, 60_000);
    r.toFrameMs = ms(t0);
    r.kind = kind;
    // Only the player's own requests: the title page warms the stream before the click.
    const mine = streams.filter((s) => !s.startedAt || s.startedAt >= clickedAt);
    const first = mine.find((s) => s.status === 200 && s.sources > 0) ?? mine[0] ?? streams.at(-1);
    r.resolverMs = first?.ms;
    r.source = first?.source;
    r.category = first?.category;
    r.dubFallback = first?.dubFallback;
    r.streamCalls = streams.length;
    if (kind === 'embed') {
      // A third-party player in an iframe: start it the way a viewer would (it does not
      // autoplay) and watch its own <video>. Its clock is cross-origin, so resume-at-second
      // cannot work for embed-only episodes — reported as N/A rather than as a pass.
      r.note = 'embed (third-party player; needs a click, no resume position)';
      r.resumeOk = 'n/a';
      const box = await page.locator('iframe[src^="http"]').first().boundingBox();
      await page.waitForTimeout(3_000);
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      const embedTime = async () => {
        for (const f of page.frames()) {
          const t = await f.evaluate(() => document.querySelector('video')?.currentTime ?? null).catch(() => null);
          if (t != null) return t;
        }
        return null;
      };
      await page.waitForTimeout(2_000);
      const a = await embedTime();
      await page.waitForTimeout(10_000);
      const b = await embedTime();
      r.advancedSec = a != null && b != null ? +(b - a).toFixed(1) : null;
      r.playing = r.advancedSec != null && r.advancedSec >= 6;
      if (!r.playing) r.failure = `embed did not play (inner video ${a} → ${b})`;
      return r;
    }
    if (kind !== 'video') {
      r.playing = false;
      r.failure = `ep1 ${kind}; stream calls: ${JSON.stringify(streams.map((s) => [s.status, s.source, s.ms, s.error]))}`;
      return r;
    }

    // ── Keeps playing ────────────────────────────────────────────────────────
    await page.evaluate(() => { const v = document.querySelector('video'); v.muted = true; return v.play().catch(() => {}); }).catch(() => {});
    const startT = await page.evaluate(() => document.querySelector('video').currentTime);
    await page.waitForTimeout(10_000);
    const endT = await page.evaluate(() => document.querySelector('video').currentTime);
    r.advancedSec = +(endT - startT).toFixed(1);
    r.playing = endT - startT >= 6;

    // ── Resume / Continue Watching (once per anime, on the sub pass) ─────────
    if (lang === 'sub') {
      await page.evaluate((t) => { const v = document.querySelector('video'); v.currentTime = t; return v.play().catch(() => {}); }, RESUME_AT);
      try {
        await page.waitForFunction((t) => {
          const h = JSON.parse(localStorage.getItem('anistream_watch_history') || '[]');
          return h.some((i) => i.timestamp >= t);
        }, RESUME_AT, { timeout: 40_000 });
      } catch { r.errors.push('history never recorded the seek position'); }
      await page.evaluate(() => document.querySelector('video')?.pause());
      const entry = await page.evaluate(() => JSON.parse(localStorage.getItem('anistream_watch_history') || '[]')[0]);
      r.savedAt = entry?.timestamp;
      r.frameThumb = entry?.frameThumbnail?.startsWith('data:image') ? 'frame' : entry?.frameThumbnail ? 'url' : 'none';

      await page.goto(WEB, { waitUntil: 'domcontentloaded' });
      const card = page.locator('.resume-card-link').first();
      await card.waitFor({ timeout: 30_000 });
      const cardSrc = await card.locator('img').first().getAttribute('src').catch(() => null);
      r.cardShowsFrame = !!cardSrc?.startsWith('data:image');
      r.brokenHomeImages = await brokenImages(page);
      await card.click();
      await page.waitForURL(/\/watch\//, { timeout: 30_000 });
      const k = await waitForFrame(page, 60_000);
      r.resumeKind = k;
      const resumedT = k === 'video' ? await page.evaluate(() => document.querySelector('video').currentTime) : -1;
      if (k !== 'video') {
        r.resumeState = await page.evaluate(() => {
          const v = document.querySelector('video');
          return { url: location.href, video: v && { rs: v.readyState, t: v.currentTime, paused: v.paused, w: v.videoWidth, src: v.currentSrc.slice(0, 80) },
            text: document.body.innerText.slice(0, 300) };
        });
        if (process.env.AUDIT_SHOTS) await page.screenshot({ path: `${process.env.AUDIT_SHOTS}/resume-${anime.id}.png` });
      }
      r.resumedAt = +resumedT.toFixed(1);
      r.resumeOk = r.savedAt != null && Math.abs(resumedT - r.savedAt) < 15;
    }

    // ── Switch to the next episode ───────────────────────────────────────────
    if (r.episodeCount > 1) {
      const next = page.locator('button[data-episode="2"]').first();
      const viaGrid = await next.count() ? next : null;
      t0 = performance.now();
      const before = streams.length;
      if (viaGrid) await viaGrid.click();
      else {
        const u = new URL(page.url()); u.searchParams.set('ep', '2');
        await page.goto(u.toString(), { waitUntil: 'commit' });
      }
      await page.waitForFunction(() => new URL(location.href).searchParams.get('ep') === '2', null, { timeout: 15_000 }).catch(() => {});
      // Wait for the old video to be replaced, then for the new one's frame.
      await page.waitForFunction(() => { const v = document.querySelector('video'); return !v || v.currentTime < 5; }, null, { timeout: 20_000, polling: 50 }).catch(() => {});
      const k2 = await waitForFrame(page, 60_000);
      r.switchMs = ms(t0);
      r.switchKind = k2;
      r.switchVia = viaGrid ? 'click' : 'url';
      const s2 = streams.slice(before).find((s) => s.sources > 0);
      r.switchResolverMs = s2?.ms ?? 'prefetched';
    }
  } catch (e) {
    r.failure = `${e.message.split('\n')[0]}`;
  } finally {
    await context.close();
  }
  return r;
}

const verdict = (r) => {
  // Plays, but only through a third-party embed: no frame thumbnail, no resume position.
  if (r.kind === 'embed') return r.playing && !(r.brokenTitleImages?.length) ? 'PASS (embed)' : 'FAIL';
  const checks = [r.kind === 'video', r.playing, !(r.brokenTitleImages?.length)];
  if (r.lang === 'sub') checks.push(r.resumeOk, r.cardShowsFrame, !(r.brokenHomeImages?.length));
  if (r.episodeCount > 1) checks.push(r.switchKind === 'video');
  return checks.every(Boolean) ? 'PASS' : 'FAIL';
};

const main = async () => {
  for (const url of [WEB, `${API}/api/health`]) {
    const ok = await fetch(url).then((x) => x.ok, () => false);
    if (!ok) throw new Error(`${url} is not reachable`);
  }
  const browser = await chromium.launch({ channel: process.env.AUDIT_CHANNEL ?? 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const results = [];
  for (const anime of SAMPLE) {
    for (const lang of ['sub', 'dub']) {
      log(`${anime.title} [${lang}] …`);
      const r = await auditOne(browser, anime, lang);
      r.verdict = verdict(r);
      log(`  ${r.verdict} details=${r.detailsMs} eps=${r.episodesMs} frame=${r.toFrameMs} resolver=${r.resolverMs} switch=${r.switchMs} src=${r.source}/${r.category}${r.dubFallback ? '(fallback)' : ''} resume=${r.resumeOk} card=${r.cardShowsFrame}${r.failure ? ` — ${r.failure}` : ''}`);
      results.push(r);
      writeFileSync(OUT, JSON.stringify({ web: WEB, api: API, at: new Date().toISOString(), results }, null, 2));
    }
  }
  await browser.close();
  const failed = results.filter((r) => r.verdict === 'FAIL').length;
  log(`${results.length - failed}/${results.length} passed → ${OUT}`);
  process.exitCode = failed ? 1 : 0;
};

main();
