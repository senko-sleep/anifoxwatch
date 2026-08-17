import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const url = 'http://localhost:8081/watch?id=anilist-207141&ep=2';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(15000);

  const domState = await page.evaluate(() => {
    return {
      readyState: document.readyState,
      title: document.title,
      rootChildren: document.querySelector('#root')?.children.length || 0,
      bodyText: document.body?.innerText?.slice(0, 500) || '',
      hasNav: document.querySelector('nav') !== null,
      hasMain: document.querySelector('main') !== null,
      hasSkeleton: document.querySelector('.animate-pulse') !== null,
      reactRoot: document.querySelector('#root')?.innerHTML?.slice(0, 500) || ''
    };
  });

  console.log('DOM State:', JSON.stringify(domState, null, 2));
  await browser.close();
})();
