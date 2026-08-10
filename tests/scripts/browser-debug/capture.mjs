/**
 * Browser console error capture for watch page debugging.
 *
 * Captures all console output, network failures, and API errors
 * while loading the watch page for specified URLs.
 *
 * Usage:
 *   node tests/scripts/browser-debug/capture.mjs [url1] [url2] ...
 *   node tests/scripts/browser-debug/capture.mjs http://localhost:8081/watch?id=anilist-1639&ep=2
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PLAYWRIGHT_PATH = 'C:/Users/Owner/.vscode/extensions/danielsanmedium.dscodegpt-3.24.43/standalone/node_modules/patchright';

async function captureErrors(url) {
  const { chromium } = require(PLAYWRIGHT_PATH);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = {
    console: [],
    pageErrors: [],
    requestFailures: [],
    apiErrors: [],
    streamErrors: [],
  };

  page.on('console', msg => {
    const entry = { type: msg.type(), text: msg.text(), timestamp: Date.now() };
    logs.console.push(entry);
    if (msg.type() === 'error') {
      console.log(`  [ERROR] ${msg.text()}`);
      logs.streamErrors.push(entry);
    }
  });

  page.on('pageerror', err => {
    const entry = { message: err.message, stack: err.stack, timestamp: Date.now() };
    logs.pageErrors.push(entry);
    console.log(`  [PAGE ERROR] ${err.message}`);
  });

  page.on('requestfailed', req => {
    const entry = {
      url: req.url(),
      method: req.method(),
      error: req.failure()?.errorText || 'unknown',
      timestamp: Date.now(),
    };
    logs.requestFailures.push(entry);
    console.log(`  [NET FAIL] ${req.method()} ${new URL(req.url()).pathname} — ${entry.error}`);
  });

  page.on('response', async resp => {
    const u = resp.url();
    if (u.includes('/api/stream')) {
      const status = resp.status();
      if (status >= 400) {
        let body = '';
        try { body = (await resp.text()).slice(0, 500); } catch {}
        const entry = { url: u, status, body, timestamp: Date.now() };
        logs.apiErrors.push(entry);
        console.log(`  [API ${status}] ${new URL(u).pathname}: ${body.slice(0, 100)}`);
      }
    }
  });

  try {
    console.log(`\nNavigating to: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log('Waiting 20s for stream resolution...');
    await page.waitForTimeout(20000);

    const playerState = await page.evaluate(() => {
      const video = document.querySelector('video');
      const iframe = document.querySelector('iframe');
      return {
        videoSrc: video ? video.src : null,
        videoPaused: video ? video.paused : null,
        videoReadyState: video ? video.readyState : null,
        videoError: video?.error ? { code: video.error.code, message: video.error.message } : null,
        iframeSrc: iframe ? iframe.src : null,
      };
    });

    console.log('  Player state:', JSON.stringify(playerState, null, 2));

    console.log('\n--- Error Summary ---');
    console.log(`  Console errors: ${logs.streamErrors.length}`);
    console.log(`  Page errors: ${logs.pageErrors.length}`);
    console.log(`  Network failures: ${logs.requestFailures.length}`);
    console.log(`  API errors (>=400): ${logs.apiErrors.length}`);

    if (logs.streamErrors.length > 0) {
      console.log('\n  Stream-related errors:');
      logs.streamErrors.forEach(e => console.log(`    ${e.text}`));
    }

    if (logs.apiErrors.length > 0) {
      console.log('\n  API error responses:');
      logs.apiErrors.forEach(e => console.log(`    [${e.status}] ${new URL(e.url).pathname}: ${e.body.slice(0, 150)}`));
    }

    return logs;
  } catch (e) {
    console.error(`Navigation error: ${e.message}`);
  } finally {
    await browser.close();
  }
}

async function run() {
  const urls = process.argv.slice(2);
  if (urls.length === 0) {
    console.log('Usage: node capture.mjs [url] [url2] ...');
    console.log('Example: node capture.mjs http://localhost:8081/watch?id=anilist-1639&ep=2');
    process.exit(1);
  }

  for (const url of urls) {
    await captureErrors(url);
  }

  process.exit(0);
}

run();
