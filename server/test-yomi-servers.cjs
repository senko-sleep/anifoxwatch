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
    if (u.includes('/api/') || u.includes('ajax') || u.includes('api.')) apiCalls.push(u);
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

  const servers = [
    { name: 'AnimePlay', url: 'https://animeplay.cfd/stream/ani/177937/1/sub' },
    { name: 'TryEmbed', url: 'https://tryembed.us.cc/embed/anime/177937/1/sub' },
    { name: 'VidNest', url: 'https://vidnest.fun/animepahe/177937/1/sub' },
    { name: 'DropFile', url: 'https://dropfile.cc/player/tv/anilist-177937/1/1?audio=sub&lang=en' },
  ];

  for (const server of servers) {
    m3u8s.clear();
    apiCalls.length = 0;
    console.log(`\n=== ${server.name} ===`);
    console.log('Loading:', server.url);
    try {
      await page.goto(server.url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 5000));
      const html = await page.content();
      console.log('Page length:', html.length);
      console.log('Has m3u8:', html.includes('m3u8'));
      console.log('Captured m3u8s:', [...m3u8s]);
      console.log('API calls:', [...new Set(apiCalls)].slice(0, 10));
    } catch (e) {
      console.log('Error:', e.message);
    }
  }

  await browser.close();
})();
