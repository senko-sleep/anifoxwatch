// Records every API call the live site makes for one watch URL.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'https://anifoxwatch.web.app/watch/anime/one-piece-21?ep=1';
const wait = Number(process.argv[3] ?? 60000);
const b = await chromium.launch(); const p = await b.newPage();
const t0 = Date.now();
p.on('response', async (r) => {
  const u = r.url(); if (!/\/api\//.test(u)) return;
  let body = ''; try { body = (await r.text()).slice(0, 160).replace(/\s+/g, ' '); } catch {}
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '').slice(0, 110)}\n      ${body}`);
});
p.on('requestfailed', (r) => /\/api\//.test(r.url()) && console.log(`FAILED ${r.url().slice(0, 110)} ${r.failure()?.errorText}`));
await p.goto(url); await p.waitForTimeout(wait);
console.log('FINAL', p.url(), '|', await p.title(), '|', (await p.locator('body').innerText()).match(/No source[^\n]*|No streaming[^\n]*|Episode \d+/g)?.slice(0, 4));
console.log('iframe:', await p.locator('iframe').first().getAttribute('src').catch(() => null), 'video:', await p.locator('video').count());
await b.close();
