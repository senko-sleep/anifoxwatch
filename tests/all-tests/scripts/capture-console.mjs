import { chromium } from 'playwright';
import fs from 'fs';

const urls = [
  'http://localhost:8081/watch?id=anilist-1639&ep=2',
  'http://localhost:8081/watch?id=anilist-207141&ep=2',
];

async function captureConsoleErrors(url) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  const warnings = [];
  const logs = [];
  const allRequests = [];

  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    logs.push(text);
    if (msg.type() === 'error') errors.push(text);
    else if (msg.type() === 'warning') warnings.push(text);
  });

  page.on('pageerror', err => {
    errors.push(`[PageError] ${err.message}\n${err.stack}`);
  });

  page.on('request', request => {
    allRequests.push(request.url());
  });

  page.on('response', async response => {
    const url = response.url();
    const status = response.status();
    if (status >= 400) {
      const text = await response.text().catch(() => '');
      errors.push(`[HTTP ${status}] ${url} - ${text.slice(0, 200)}`);
    }
  });

  page.on('requestfailed', request => {
    errors.push(`[RequestFailed] ${request.failure()?.errorText} - ${request.url()}`);
  });

  console.log(`\n=== Loading: ${url} ===`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(15000);
  } catch (e) {
    errors.push(`[NavigationError] ${e}`);
  }

  const result = {
    url, errors, warnings, logs, allRequests,
    uniqueRequests: [...new Set(allRequests)]
  };
  console.log(`Errors (${errors.length}):`, errors.slice(0, 30));
  console.log(`Warnings (${warnings.length}):`, warnings.slice(0, 10));
  console.log(`Total logs: ${logs.length}`);
  console.log(`Sample logs:`, logs.slice(0, 40));
  console.log(`Total requests: ${allRequests.length}`);
  console.log(`Unique requests:`, [...new Set(allRequests)].slice(0, 30));

  fs.writeFileSync('console-capture.json', JSON.stringify(result, null, 2));
  await browser.close();
  return result;
}

(async () => {
  const results = [];
  for (const url of urls) {
    const res = await captureConsoleErrors(url);
    results.push(res);
  }
  fs.writeFileSync('console-capture-all.json', JSON.stringify(results, null, 2));
  console.log('\nDone.');
})();
