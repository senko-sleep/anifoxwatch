const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  const m3u8s = new Set();
  const apiCalls = [];

  page.on('request', req => {
    const u = req.url();
    if (u.includes('.m3u8') || u.includes('m3u8')) m3u8s.add(u);
    if (u.includes('/api/') || u.includes('ajax')) apiCalls.push(u);
    req.continue();
  });

  page.on('response', async res => {
    const u = res.url();
    if (u.includes('.m3u8') || u.includes('m3u8')) m3u8s.add(u);
    try {
      const ct = res.headers()['content-type'] || '';
      if (ct.includes('json')) {
        const txt = await res.text();
        const matches = txt.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/g);
        if (matches) matches.forEach(m => m3u8s.add(m));
      }
    } catch (e) { }
  });

  console.log('Loading MegaPlay with stealth...');
  await page.goto('https://megaplay.buzz/stream/ani/177937/1/sub', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });
  await new Promise(r => setTimeout(r, 10000));

  const html = await page.content();
  console.log('Page length:', html.length);
  console.log('Has player div:', html.includes('megaplay-player'));
  console.log('Has data-id:', html.includes('data-id'));
  
  const playerData = await page.evaluate(() => {
    const el = document.getElementById('megaplay-player');
    if (!el) return null;
    const data = {};
    ['data-id', 'data-realid', 'data-mediaid', 'data-fileversion'].forEach(attr => {
      data[attr] = el.getAttribute(attr);
    });
    return data;
  });
  console.log('Player data:', playerData);

  console.log('Captured m3u8s:', [...m3u8s]);
  console.log('API calls:', [...new Set(apiCalls)].slice(0, 20));

  await browser.close();
})();
