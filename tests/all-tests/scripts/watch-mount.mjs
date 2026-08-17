import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:8081/watch?id=anilist-207141&ep=2', { waitUntil: 'commit', timeout: 30000 });
  
  // Check at multiple intervals
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => {
      const main = document.querySelector('main');
      const skeletons = document.querySelectorAll('.animate-pulse').length;
      const loadingText = document.body?.innerText?.includes('Loading') || false;
      return {
        mainExists: !!main,
        skeletonCount: skeletons,
        loadingText,
        bodyText: document.body?.innerText?.slice(0, 200) || ''
      };
    });
    console.log(`T+${(i+1)*3}s:`, JSON.stringify(state));
  }

  await browser.close();
})();
