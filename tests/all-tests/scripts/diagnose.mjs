/**
 * Watch page browser diagnostic — organized test entry point.
 *
 * Usage:
 *   node tests/scripts/watch-debug/diagnose.mjs [url]
 *   node tests/scripts/watch-debug/diagnose.mjs http://localhost:8081/watch?id=anilist-1639&ep=2
 *
 * Requires: patchright (or playwright) installed at the VS Code extension path
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const PLAYWRIGHT_PATH = 'C:/Users/Owner/.vscode/extensions/danielsanmedium.dscodegpt-3.24.43/standalone/node_modules/patchright';

async function diagnose(url) {
  const { chromium } = require(PLAYWRIGHT_PATH);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`DIAGNOSING: ${url}`);
  console.log('='.repeat(50));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleLogs = [];
  const networkErrors = [];
  const apiRequests = [];

  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    consoleLogs.push({ type, text, timestamp: Date.now() });
    if (type === 'error') {
      console.log(`  [CONSOLE ERROR] ${text}`);
    }
  });

  page.on('pageerror', err => {
    console.log(`  [PAGE ERROR] ${err.message}`);
    consoleLogs.push({ type: 'pageerror', text: err.message, timestamp: Date.now() });
  });

  page.on('requestfailed', req => {
    const errText = req.failure()?.errorText || 'unknown';
    console.log(`  [FAILED] ${req.method()} ${new URL(req.url()).pathname} — ${errText}`);
    networkErrors.push({ url: req.url(), error: errText, timestamp: Date.now() });
  });

  page.on('response', async resp => {
    const u = resp.url();
    if (u.includes('/api/') || u.includes('m3u8') || u.includes('stream')) {
      const status = resp.status();
      apiRequests.push({ url: u, status, timestamp: Date.now() });
      if (status >= 400) {
        console.log(`  [API ${status}] ${new URL(u).pathname}`);
      }
    }
  });

  try {
    const startTime = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`  Page loaded in ${Date.now() - startTime}ms`);

    console.log('  Waiting 12s for stream resolution...');
    await page.waitForTimeout(12000);

    const result = await page.evaluate(() => {
      const video = document.querySelector('video');
      const iframe = document.querySelector('iframe');
      const loadingEl = document.querySelector('[class*="loading"], [class* "spinner"], .shimmer');
      const errorEl = document.querySelector('[class*="error"], [class*="Alert"]');

      return {
        title: document.title,
        videoSrc: video ? video.src : null,
        videoPaused: video ? video.paused : null,
        videoReadyState: video ? video.readyState : null,
        videoError: video?.error ? { code: video.error.code, message: video.error.message } : null,
        iframeSrc: iframe ? iframe.src : null,
        isLoading: loadingEl ? loadingEl.offsetParent !== null : false,
        errorText: errorEl ? errorEl.textContent?.slice(0, 200) : null,
      };
    });

    console.log('\n  PLAYER STATE:');
    console.log(`    Video src: ${result.videoSrc ? result.videoSrc.slice(0, 80) + '...' : 'null'}`);
    console.log(`    Video paused: ${result.videoPaused}`);
    console.log(`    Video readyState: ${result.videoReadyState}`);
    console.log(`    Video error: ${result.videoError ? JSON.stringify(result.videoError) : 'none'}`);
    console.log(`    Iframe src: ${result.iframeSrc ? result.iframeSrc.slice(0, 80) + '...' : 'null'}`);
    console.log(`    Loading indicator: ${result.isLoading}`);
    console.log(`    Error text: ${result.errorText || 'none'}`);

    const streamErrors = consoleLogs.filter(l => l.type === 'error' || l.text.includes('Error') || l.text.includes('error'));
    if (streamErrors.length > 0) {
      console.log('\n  CONSOLE ERRORS:');
      streamErrors.forEach(e => console.log(`    [${e.type}] ${e.text}`));
    }

    const failedApis = apiRequests.filter(r => r.status >= 400);
    if (failedApis.length > 0) {
      console.log('\n  FAILED API REQUESTS:');
      failedApis.forEach(r => console.log(`    [${r.status}] ${new URL(r.url).pathname}`));
    }

  } catch (e) {
    console.error(`  Navigation error: ${e.message}`);
  } finally {
    await browser.close();
  }
}

const url = process.argv[2] || 'http://localhost:8081/watch?id=anilist-1639&ep=2';
await diagnose(url);
