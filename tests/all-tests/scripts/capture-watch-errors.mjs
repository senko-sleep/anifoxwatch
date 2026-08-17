import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Owner/.vscode/extensions/danielsanmedium.dscodegpt-3.24.43/standalone/node_modules/patchright');

async function testWatchPage(url) {
  console.log(`\n========================================`);
  console.log(`TESTING URL: ${url}`);
  console.log(`========================================`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleLogs = [];
  const networkErrors = [];
  const apiLogs = [];

  page.on('console', msg => {
    const entry = `[CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`;
    consoleLogs.push(entry);
    console.log(entry);
  });

  page.on('pageerror', err => {
    const entry = `[PAGE ERROR] ${err.message}\n${err.stack}`;
    consoleLogs.push(entry);
    console.log(entry);
  });

  page.on('requestfailed', req => {
    const entry = `[NET FAIL] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`;
    networkErrors.push(entry);
    console.log(entry);
  });

  page.on('response', async resp => {
    const u = resp.url();
    if (u.includes('/api/')) {
      const status = resp.status();
      let bodyText = '';
      try {
        bodyText = (await resp.text()).slice(0, 300);
      } catch (e) { }
      const entry = `[API ${status}] ${u}\n   Response: ${bodyText}`;
      apiLogs.push(entry);
      console.log(entry);
    }
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('--- Page loaded, waiting 8 seconds for initial stream fetch ---');
    await page.waitForTimeout(8000);

    // Get current state
    const playerState = await page.evaluate(() => {
      const video = document.querySelector('video');
      const iframe = document.querySelector('iframe');
      const errorEl = document.querySelector('[class*="bg-red"], [class*="text-red"], .error');
      const episodeButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.includes('Ep') || b.textContent?.match(/^\d+$/));
      return {
        videoSrc: video ? video.src : null,
        videoError: video && video.error ? { code: video.error.code, message: video.error.message } : null,
        videoReadyState: video ? video.readyState : null,
        videoPaused: video ? video.paused : null,
        iframeSrc: iframe ? iframe.src : null,
        errorText: errorEl ? errorEl.textContent : null,
        episodeCount: episodeButtons.length,
        visibleText: document.body.innerText.slice(0, 1000)
      };
    });

    console.log('INITIAL PLAYER STATE:', JSON.stringify(playerState, null, 2));

    // Try clicking episode 3 or next episode button if available
    console.log('--- Attempting episode switch ---');
    const nextEpClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const nextBtn = buttons.find(b => b.querySelector('svg.lucide-chevron-right') || b.getAttribute('title')?.includes('Next') || b.textContent?.includes('Next'));
      if (nextBtn) {
        nextBtn.click();
        return 'Clicked next episode button';
      }
      return 'Next button not found';
    });
    console.log('Episode switch result:', nextEpClicked);

    await page.waitForTimeout(5000);

    const updatedState = await page.evaluate(() => {
      const video = document.querySelector('video');
      return {
        videoSrc: video ? video.src : null,
        urlAfterSwitch: window.location.href
      };
    });
    console.log('UPDATED STATE AFTER SWITCH:', JSON.stringify(updatedState, null, 2));

  } catch (e) {
    console.error('Test script error:', e);
  } finally {
    await browser.close();
  }
}

async function run() {
  await testWatchPage('http://localhost:8081/watch?id=anilist-1639&ep=2');
  await testWatchPage('http://localhost:8081/watch?id=anilist-207141&ep=2');
}

run();
