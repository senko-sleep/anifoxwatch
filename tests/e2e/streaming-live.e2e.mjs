// Real provider traffic only. Failure injection excludes a provider or drops its
// media requests; it never substitutes a stream or a successful API response.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const target = process.env.STREAM_E2E_URL || 'http://localhost:8081/watch/anime/spy-x-family-season-3?ep=2';
const output = '.stream-diagnostics';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const reports = [];
const cases = [
    { name: 'normal-1' }, { name: 'normal-2' }, { name: 'normal-3' },
    { name: 'without-reanime', exclude: 'ReAnime', expected: 'Aniwaves' },
    { name: 'without-aniwaves', exclude: 'Aniwaves', expected: 'ReAnime' },
    { name: 'playback-failover', blockMedia: true, expected: 'ReAnime' },
];
try {
    for (const scenario of cases.filter(c => !process.env.STREAM_E2E_CASE || c.name === process.env.STREAM_E2E_CASE)) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const resolutions = [];
        const mediaFailures = [];
        page.on('response', async response => {
            if (!response.url().includes('/api/stream/watch/')) return;
            const url = new URL(response.url());
            if (url.searchParams.get('ep_num') !== '2' || url.searchParams.get('category') === 'dub') return;
            try {
                const data = await response.json();
                resolutions.push({ status: response.status(), source: data.source, attempts: data.attempts,
                    exclude: url.searchParams.get('exclude_providers'), embed: data.sources?.[0]?.isEmbed });
            } catch { /* capture failures separately */ }
        });
        if (scenario.exclude || scenario.blockMedia) await page.route('**/api/stream/watch/**', route => {
            const url = new URL(route.request().url());
            if (scenario.exclude) url.searchParams.set('exclude_providers', scenario.exclude);
            else if (!url.searchParams.has('exclude_providers')) url.searchParams.set('exclude_providers', 'ReAnime');
            return route.continue({ url: url.href });
        });
        if (scenario.blockMedia) await page.route('**/api/stream/proxy?**', route => {
            const targetUrl = new URL(route.request().url()).searchParams.get('url') || '';
            if (targetUrl) {
                mediaFailures.push(targetUrl.split('?')[0]);
                return route.abort('failed');
            }
            return route.continue();
        });
        const started = Date.now();
        await page.goto(target);
        let playingFrame, initial;
        while (Date.now() - started < 120000 && !playingFrame) {
            for (const frame of page.frames()) {
                try {
                    const state = await frame.evaluate(() => {
                        const video = [...document.querySelectorAll('video')].find(v => v.duration > 600 && v.readyState >= 2);
                        if (!video) return null;
                        video.muted = true;
                        void video.play().catch(() => {});
                        return { time: video.currentTime, duration: video.duration, frames: video.getVideoPlaybackQuality().totalVideoFrames, title: document.title };
                    });
                    if (state) { playingFrame = frame; initial = state; break; }
                } catch { /* frames can navigate during extraction */ }
            }
            if (!playingFrame) await new Promise(resolve => setTimeout(resolve, 1000));
        }
        assert.ok(playingFrame, `${scenario.name}: no decoded episode video`);
        const samples = [];
        for (let sample = 0; sample < 4; sample++) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            samples.push(await playingFrame.evaluate(() => {
                const video = [...document.querySelectorAll('video')].find(v => v.duration > 600);
                return { time: video.currentTime, ready: video.readyState, paused: video.paused,
                    frames: video.getVideoPlaybackQuality().totalVideoFrames, error: video.error?.message };
            }));
        }
        assert.ok(samples.at(-1).time - initial.time >= 15, `${scenario.name}: clock stalled: ${JSON.stringify(samples)}`);
        assert.ok(samples.at(-1).frames - initial.frames > 250, `${scenario.name}: insufficient decoded frames`);
        assert.ok(samples.every(sample => !sample.error), `${scenario.name}: media error`);
        const finalSource = resolutions.at(-1)?.source;
        if (scenario.expected) assert.equal(finalSource, scenario.expected);
        if (scenario.blockMedia) assert.ok(mediaFailures.length > 0, 'Playback failure was not injected');
        assert.equal(await page.locator('h1').innerText(), 'Episode 2');
        assert.match(await page.title(), /Spy.*Family.*Season 3/i);
        await page.screenshot({ path: `${output}/${scenario.name}.png` });
        const report = { name: scenario.name, startupMs: Date.now() - started - 20000, initial,
            samples, resolutions, forcedMediaFailures: mediaFailures.length, source: finalSource };
        reports.push(report);
        await writeFile(`${output}/live-results.json`, JSON.stringify(reports, null, 2));
        console.log('PASS', JSON.stringify(report));
        await context.close();
    }
} finally { await browser.close(); }
