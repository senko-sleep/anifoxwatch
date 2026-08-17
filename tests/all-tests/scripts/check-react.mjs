import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:8081/watch?id=anilist-207141&ep=2', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(15000);

  const reactQueryState = await page.evaluate(() => {
    const qc = document.querySelector('[data-testid="watch-page"]');
    return {
      bodyLength: document.body?.innerText?.length || 0,
      bodyText: document.body?.innerText?.slice(0, 800) || '',
      scripts: Array.from(document.querySelectorAll('script')).map(s => s.src || '(inline)').slice(0, 10)
    };
  });

  console.log('React Query state:', JSON.stringify(reactQueryState, null, 2));
  await browser.close();
})();
