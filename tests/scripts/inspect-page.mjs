import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('http://localhost:8081/watch?id=anilist-1639&ep=2', { waitUntil: 'commit', timeout: 30000 });
await page.waitForTimeout(12000);

const mainHtml = await page.evaluate(() => {
  const main = document.querySelector('main');
  return main ? main.innerHTML.slice(0, 1000) : 'NO MAIN TAG';
});

const appDivHtml = await page.evaluate(() => {
  const divs = document.querySelectorAll('div');
  for (const div of divs) {
    if (div.className === 'min-h-screen flex flex-col bg-background') {
      return div.innerHTML.slice(0, 1500);
    }
  }
  return 'NO APP DIV';
});

console.log('Main tag content:', mainHtml);
console.log('App div content:', appDivHtml);

await browser.close();
