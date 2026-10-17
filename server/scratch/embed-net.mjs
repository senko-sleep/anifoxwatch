import { chromium } from 'playwright';
const url = process.argv[2];
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext();
await ctx.setExtraHTTPHeaders({ Referer: 'https://aniwaves.ru/' });
const p = await ctx.newPage();
p.on('request', (r) => { if (!/\.(png|jpg|css|woff2?|svg|gif)(\?|$)/.test(r.url())) console.log('REQ', r.method(), r.resourceType(), r.url().slice(0, 220), r.postData()?.slice(0, 200) ?? ''); });
p.on('response', async (r) => {
  const u = r.url();
  if (/m3u8|ajax|api|source|getSources|\/e\//i.test(u) && r.request().resourceType() !== 'document') {
    const t = await r.text().catch(() => '');
    console.log('RES', r.status(), u.slice(0, 160), '\n   ', t.slice(0, 400).replace(/\n/g, ' | '));
  }
});
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(8000);
await p.mouse.click(400, 300).catch(() => {});
await p.waitForTimeout(6000);
await b.close();
