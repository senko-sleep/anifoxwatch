import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const url = 'http://localhost:8081/watch?id=anilist-207141&ep=2';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(15000);

  const fetchResult = await page.evaluate(async () => {
    const results = {};
    try {
      const r1 = await fetch('/api/anime?id=anilist-207141');
      results.animeStatus = r1.status;
      results.animeOk = r1.ok;
    } catch (e) {
      results.animeError = e.message;
    }
    try {
      const r2 = await fetch('/api/anime/episodes?id=anilist-207141');
      results.episodesStatus = r2.status;
      results.episodesOk = r2.ok;
    } catch (e) {
      results.episodesError = e.message;
    }
    try {
      const r3 = await fetch('/api/anime/resolve?id=anilist-207141');
      results.resolveStatus = r3.status;
      results.resolveOk = r3.ok;
    } catch (e) {
      results.resolveError = e.message;
    }
    return results;
  });

  console.log('Fetch results from browser:', JSON.stringify(fetchResult, null, 2));
  await browser.close();
})();
