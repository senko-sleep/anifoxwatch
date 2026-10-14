/**
 * Catalog playback sweep — real Chrome, real decoded frames, one fresh context per title.
 *
 *   node tests/e2e/catalog-playback.mjs
 *   TITLES='frieren-beyond-journeys-end-154587:sub:1,your-name-21519:sub:1' node tests/e2e/catalog-playback.mjs
 *
 * A title passes when its <video> decodes a first frame and the clock then advances >= 10s over
 * PLAY_SEC seconds. For each title the provider, server, stream format, resolve latency and
 * first-frame latency are recorded, and a failure keeps whatever the page said about it.
 */
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';

const WEB = process.env.WEB ?? 'https://anifoxwatch.web.app';
const PLAY_SEC = +(process.env.PLAY_SEC ?? 15);
const OUT = process.env.OUT ?? '.artifacts/catalog-playback.jsonl';
const DEFAULT = [
    'frieren-beyond-journeys-end-154587:sub:5',     // popular, 28 eps
    'spy-x-family-140960:dub:3',                    // dubbed
    'your-name-21519:sub:1',                        // movie
    'cowboy-bebop-1:sub:4',                         // older
    'one-piece-21:sub:1100',                        // long-running, high episode number
    'solo-leveling-151807:dub:2',                   // dubbed, recent
    'dandadan-171018:sub:7',                        // recent
    'haibane-renmei-387:sub:2',                     // obscure
    'steinsgate-9253:sub:12',                       // punctuated title
    'you-and-i-are-polar-opposites-season-2-210031:dub:1', // priority title, dub
];
const titles = (process.env.TITLES ? process.env.TITLES.split(',') : DEFAULT).map((t) => {
    const [slug, lang, ep] = t.split(':');
    return { slug, lang, ep: +ep };
});

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (page) => page.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return { video: false, text: document.body.innerText.slice(0, 240) };
    const q = v.getVideoPlaybackQuality?.();
    return { video: true, rs: v.readyState, t: v.currentTime, w: v.videoWidth, h: v.videoHeight, frames: q?.totalVideoFrames ?? -1 };
}).catch((e) => ({ video: false, evalError: e.message.slice(0, 100) }));

const browser = await chromium.launch({ channel: process.env.CHANNEL ?? 'chrome', headless: !process.env.HEADED,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
let passed = 0;
for (const { slug, lang, ep } of titles) {
    const url = `${WEB}/watch/anime/${slug}?lang=${lang}&ep=${ep}`;
    const r = { at: new Date().toISOString(), slug, lang, ep, url };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('response', async (res) => {
        if (!/\/api\/stream\/watch\//.test(res.url()) || r.watch) return;
        const body = await res.json().catch(() => null);
        r.watch = { status: res.status(), ms: Math.round(res.request().timing().responseEnd), provider: body?.source,
            server: body?.sources?.[0]?.server, hls: body?.sources?.[0]?.isM3U8, embed: body?.sources?.[0]?.isEmbed,
            category: body?.category, dubFallback: body?.dubFallback, subtitles: body?.subtitles?.length,
            attempts: body?.attempts?.map((a) => `${a.provider}:${a.status}`), error: body?.error };
    });
    const t0 = performance.now();
    try {
        await page.goto(url, { waitUntil: 'commit', timeout: 45_000 });
        let s;
        while (performance.now() - t0 < 90_000) {
            s = await state(page);
            if (s.video && s.rs >= 2 && s.w > 0 && s.t > 0 && s.frames > 0) break;
            if (!s.video && /No source for this episode|couldn.t load|Stream unavailable|not found/i.test(s.text ?? '')) break;
            await sleep(150);
        }
        r.firstFrameMs = Math.round(performance.now() - t0);
        if (!(s.video && s.frames > 0)) throw new Error(`no first frame: ${JSON.stringify(s).slice(0, 260)}`);
        const a = await state(page);
        await sleep(PLAY_SEC * 1000);
        const b = await state(page);
        r.advance = +(b.t - a.t).toFixed(2); r.frames = b.frames - a.frames; r.resolution = `${b.w}x${b.h}`;
        r.pass = r.advance >= Math.min(10, PLAY_SEC * 0.66) && r.frames > 100;
        if (!r.pass) r.failure = `playback stalled ${JSON.stringify({ a, b })}`;
    } catch (e) {
        r.pass = false; r.failure = e.message.slice(0, 400);
    }
    await ctx.close();
    passed += r.pass ? 1 : 0;
    appendFileSync(OUT, JSON.stringify(r) + '\n');
    log(`${r.pass ? 'PASS' : 'FAIL'} ${slug} ${lang} ep${ep} ttff=${r.firstFrameMs}ms resolve=${r.watch?.ms}ms ${r.watch?.provider ?? '-'} ` +
        `${r.watch?.server ?? ''} ${r.resolution ?? ''} adv=${r.advance ?? '-'}${r.watch?.dubFallback ? ' (dub→sub fallback)' : ''}${r.failure ? `\n    ${r.failure}` : ''}`);
}
await browser.close();
log(`${passed}/${titles.length} titles played`);
