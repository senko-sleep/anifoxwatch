/**
 * Bounded real-browser production playback audit for Re:Zero season 4, dub episode 14.
 *
 * Run only after deploying both API and frontend:
 *   node tests/e2e/rezero-production-reliability.mjs
 *
 * One Chromium browser, one page/context at a time. No media or successful API
 * response is mocked. Results are written after every scenario so failures leave
 * an inspectable report. Override REZERO_REPORT, REZERO_WEB, REZERO_API as needed.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const WEB = (process.env.REZERO_WEB || 'https://anifoxwatch.web.app').replace(/\/$/, '');
const API = (process.env.REZERO_API || 'https://poor-marne-sssssenko-05a416b4.koyeb.app').replace(/\/$/, '');
const WATCH_PATH = '/watch/anime/rezero-starting-life-in-another-world-season-4-189046?lang=dub&ep=14&s=5';
const REPORT = process.env.REZERO_REPORT || '.stream-diagnostics/rezero-production-reliability.json';
const STARTUP_LIMIT_MS = 90_000;
const SAMPLE_INTERVAL_MS = 5_000;
const SAMPLE_COUNT = 4;
const MAX_FAILURE_INJECTION = 3;
const selectedCase = process.env.REZERO_CASE;
const reports = [];
let previousServerMemory = null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hostname = value => { try { return new URL(value).hostname; } catch { return 'invalid'; } };
const isMediaRequest = url => /\/api\/stream\/proxy|\.(?:m3u8|mp4|m4s|ts)(?:[?&#]|$)/i.test(url);
const mediaLabel = url => {
  try {
    const u = new URL(url);
    const upstream = u.searchParams.get('url');
    return `${u.hostname}${upstream ? ` -> ${hostname(upstream)}` : ''}`;
  } catch { return 'invalid'; }
};

async function save() {
  await mkdir(REPORT.slice(0, REPORT.lastIndexOf('/')) || '.', { recursive: true });
  await writeFile(REPORT, JSON.stringify({ target: `${WEB}${WATCH_PATH}`, generatedAt: new Date().toISOString(), reports }, null, 2));
}

async function serverMemory() {
  try {
    const response = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(5_000) });
    const health = await response.json();
    return { status: response.status, memory: health.memory || null };
  } catch (error) { return { error: String(error) }; }
}

async function browserMemory(page) {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const metrics = (await cdp.send('Performance.getMetrics')).metrics;
    const metric = name => metrics.find(item => item.name === name)?.value;
    const dom = await cdp.send('Memory.getDOMCounters').catch(() => null);
    await cdp.detach();
    return { jsHeapUsedBytes: metric('JSHeapUsedSize'), jsHeapTotalBytes: metric('JSHeapTotalSize'),
      documents: dom?.documents, nodes: dom?.nodes, jsEventListeners: dom?.jsEventListeners };
  } catch (error) { return { error: String(error) }; }
}

async function episodeVideo(page) {
  for (const frame of page.frames()) {
    try {
      const video = await frame.evaluate(() => {
        const v = [...document.querySelectorAll('video')].find(item => item.duration > 600 && item.readyState >= 2);
        if (!v) return null;
        v.muted = true;
        void v.play().catch(() => {});
        return { time: v.currentTime, duration: v.duration, ready: v.readyState, paused: v.paused,
          frames: v.getVideoPlaybackQuality?.().totalVideoFrames ?? null,
          decodedFrames: v.webkitDecodedFrameCount ?? null, error: v.error?.message || null };
      });
      if (video) return { frame, video };
    } catch { /* frame may navigate during extraction */ }
  }
  return null;
}

async function videoSample(frame) {
  return frame.evaluate(() => {
    const v = [...document.querySelectorAll('video')].find(item => item.duration > 600);
    if (!v) throw new Error('episode video disappeared');
    const ranges = [];
    for (let i = 0; i < v.buffered.length; i++) ranges.push([v.buffered.start(i), v.buffered.end(i)]);
    return { time: v.currentTime, duration: v.duration, ready: v.readyState, paused: v.paused,
      frames: v.getVideoPlaybackQuality?.().totalVideoFrames ?? null,
      decodedFrames: v.webkitDecodedFrameCount ?? null, buffered: ranges,
      error: v.error?.message || null };
  });
}

async function runCase(context, name, options = {}) {
  const page = await context.newPage();
  const started = Date.now();
  const row = { name, startedAt: new Date(started).toISOString(), status: 'running',
    resolutions: [], media: { ok: 0, errors: [], domains: {} }, failedRequests: [], injections: 0 };
  reports.push(row);
  const pending = new Map();
  const responseTasks = [];
  const initialProvider = options.excludeProvider;
  try {
    if (options.excludeProvider) await page.route('**/api/stream/watch/**', route => {
      const url = new URL(route.request().url());
      const excluded = new Set((url.searchParams.get('exclude_providers') || '').split(',').filter(Boolean));
      excluded.add(initialProvider);
      url.searchParams.set('exclude_providers', [...excluded].join(','));
      url.searchParams.set('nocache', 'true');
      return route.continue({ url: url.href });
    });
    if (options.failFirstResolve) await page.route('**/api/stream/watch/**', route => {
      if (row.injections++ === 0) return route.fulfill({ status: 503, contentType: 'application/json',
        body: JSON.stringify({ code: 'NO_STREAMING_SOURCES', retryable: true, error: 'Injected resolver failure' }) });
      return route.continue();
    });
    if (options.abortFirstMedia || options.expireFirstMedia || options.invalidFirstMedia) await page.route('**/*', route => {
      if (isMediaRequest(route.request().url()) && row.injections < MAX_FAILURE_INJECTION) {
        row.injections++;
        if (options.abortFirstMedia) return route.abort('failed');
        if (options.expireFirstMedia) return route.fulfill({ status: 410, contentType: 'application/json',
          body: '{"error":"Injected expired stream"}' });
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Invalid media</html>' });
      }
      return route.continue();
    });
    page.on('request', request => {
      if (request.url().includes('/api/stream/watch/')) pending.set(request, Date.now());
    });
    page.on('response', response => {
      const url = response.url();
      if (url.includes('/api/stream/watch/')) {
        const startedAt = pending.get(response.request()) || started;
        const resolution = { status: response.status(), durationMs: Date.now() - startedAt,
          category: new URL(url).searchParams.get('category'),
          excluded: new URL(url).searchParams.get('exclude_providers') };
        row.resolutions.push(resolution);
        responseTasks.push(response.json().then(data => Object.assign(resolution, {
          source: data.source,
          probeVerified: data.sources?.[0]?.probeVerified, embed: data.sources?.[0]?.isEmbed,
          sourceCount: data.sources?.length || 0, attempts: data.attempts || [] }),
        error => Object.assign(resolution, { parseError: String(error) })));
      }
      if (isMediaRequest(url)) {
        const label = mediaLabel(url);
        row.media.domains[label] = (row.media.domains[label] || 0) + 1;
        if (response.ok()) row.media.ok++;
        else row.media.errors.push({ status: response.status(), target: label });
      }
    });
    page.on('requestfailed', request => {
      if (request.url().includes('/api/stream/') || isMediaRequest(request.url()))
        row.failedRequests.push({ target: mediaLabel(request.url()), error: request.failure()?.errorText });
    });
    row.memoryBefore = { browser: await browserMemory(page), server: previousServerMemory,
      node: process.memoryUsage().rss };
    await page.goto(`${WEB}${WATCH_PATH}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (options.refresh) await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    let found = null;
    while (Date.now() - started < STARTUP_LIMIT_MS && !found) {
      found = await episodeVideo(page);
      if (!found) await sleep(1000);
    }
    assert.ok(found, `no decoded episode video within ${STARTUP_LIMIT_MS}ms`);
    row.startupMs = Date.now() - started;
    row.initial = found.video;
    const samples = [];
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      await sleep(SAMPLE_INTERVAL_MS);
      samples.push(await videoSample(found.frame));
    }
    row.samples = samples;
    const last = samples.at(-1);
    assert.ok(last.time - found.video.time >= 12, `playhead stalled: ${JSON.stringify(samples)}`);
    const startFrames = found.video.frames ?? found.video.decodedFrames;
    const endFrames = last.frames ?? last.decodedFrames;
    assert.ok(startFrames == null || endFrames - startFrames >= 120,
      `decoded frames did not advance: ${startFrames} -> ${endFrames}`);
    assert.ok(samples.every(sample => !sample.error && sample.ready >= 2), 'media error or starvation');
    if (options.failFirstResolve || options.abortFirstMedia || options.expireFirstMedia || options.invalidFirstMedia)
      assert.ok(row.injections > 0, 'failure was not injected');
    if (options.excludeProvider) assert.ok(row.resolutions.some(resolution => resolution.excluded?.includes(options.excludeProvider)),
      'provider exclusion did not reach the API');
    row.status = 'pass';
  } catch (error) {
    row.status = 'fail';
    row.error = error instanceof Error ? error.message : String(error);
  } finally {
    await Promise.race([Promise.allSettled(responseTasks), sleep(5_000)]);
    row.elapsedMs = Date.now() - started;
    row.memoryAfter = { browser: await browserMemory(page), server: await serverMemory(), node: process.memoryUsage().rss };
    previousServerMemory = row.memoryAfter.server;
    await page.close().catch(() => {});
    await save();
    console.log(`${row.status.toUpperCase()} ${name}: ${JSON.stringify({ startupMs: row.startupMs,
      elapsedMs: row.elapsedMs, source: row.resolutions.at(-1)?.source, error: row.error,
      playhead: row.samples?.map(sample => Number(sample.time.toFixed(1))) })}`);
  }
  return row;
}

const browser = await chromium.launch({ headless: true,
  ...(process.env.REZERO_BROWSER_CHANNEL ? { channel: process.env.REZERO_BROWSER_CHANNEL } : {}),
  args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const warmContext = await browser.newContext();
  try {
    if (!selectedCase || selectedCase === 'cold-1') await runCase(warmContext, 'cold-1');
    if (!selectedCase || selectedCase === 'warm-revisit') await runCase(warmContext, 'warm-revisit');
    if (!selectedCase || selectedCase === 'warm-refresh') await runCase(warmContext, 'warm-refresh', { refresh: true });
  } finally { await warmContext.close(); }

  for (const name of ['cold-2', 'cold-3']) {
    if (selectedCase && selectedCase !== name) continue;
    const context = await browser.newContext();
    try { await runCase(context, name); } finally { await context.close(); }
  }

  const preferred = process.env.REZERO_PREFERRED_PROVIDER || reports.find(row => row.resolutions.some(resolution => resolution.source))?.resolutions.find(resolution => resolution.source)?.source;
  if (preferred && (!selectedCase || selectedCase === 'exclude-preferred-provider')) {
    const context = await browser.newContext();
    try { await runCase(context, 'exclude-preferred-provider', { excludeProvider: preferred }); }
    finally { await context.close(); }
  } else if (!preferred && !selectedCase) reports.push({ name: 'exclude-preferred-provider', status: 'skip',
    error: 'No preferred provider resolved in earlier scenarios' });
  for (const [name, options] of [
    ['resolver-503-recovery', { failFirstResolve: true }],
    ['media-request-recovery', { abortFirstMedia: true }],
    ['expired-media-recovery', { expireFirstMedia: true }],
    ['invalid-media-recovery', { invalidFirstMedia: true }],
  ]) {
    if (selectedCase && selectedCase !== name) continue;
    const context = await browser.newContext();
    try { await runCase(context, name, options); } finally { await context.close(); }
  }
} finally { await browser.close(); }

const failed = reports.filter(row => row.status !== 'pass');
console.log(`Playback scenarios: ${reports.length - failed.length}/${reports.length} passed. Report: ${REPORT}`);
if (failed.length) process.exitCode = 1;
