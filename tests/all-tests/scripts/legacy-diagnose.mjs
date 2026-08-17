import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Owner/.vscode/extensions/danielsanmedium.dscodegpt-3.24.43/standalone/node_modules/patchright');

async function diagnose(url) {
  console.log(`\n========================================`);
  console.log(`DIAGNOSING URL: ${url}`);
  console.log(`========================================\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleLogs = [];
  const networkErrors = [];
  const apiRequests = [];

  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    consoleLogs.push({ type, text });
    console.log(`[BROWSER CONSOLE ${type.toUpperCase()}]`, text);
  });

  page.on('pageerror', err => {
    console.log(`[PAGE UNCAUGHT ERROR]`, err.message, err.stack);
  });

  page.on('requestfailed', req => {
    console.log(`[FAILED REQUEST] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    networkErrors.push({ url: req.url(), error: req.failure()?.errorText });
  });

  page.on('response', async resp => {
    const u = resp.url();
    if (u.includes('/api/') || u.includes('/watch') || u.includes('aniwave') || u.includes('m3u8')) {
      const status = resp.status();
      console.log(`[API RESPONSE ${status}] ${u}`);
      apiRequests.push({ url: u, status });
    }
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('DOM Content Loaded, waiting 10 seconds for video stream and UI to populate...');
    await page.waitForTimeout(10000);

    const title = await page.title();
    console.log('Page Title:', title);

    const videoSrc = await page.evaluate(() => {
      const video = document.querySelector('video');
      const iframe = document.querySelector('iframe');
      return {
        videoSrc: video ? video.src : null,
        videoCurrentTime: video ? video.currentTime : null,
        videoPaused: video ? video.paused : null,
        videoReadyState: video ? video.readyState : null,
        videoError: video && video.error ? { code: video.error.code, message: video.error.message } : null,
        iframeSrc: iframe ? iframe.src : null,
        bodyText: document.body.innerText.slice(0, 500)
      };
    });

    console.log('PLAYER STATE:', JSON.stringify(videoSrc, null, 2));

  } catch (e) {
    console.error('Navigation or test error:', e);
  } finally {
    await browser.close();
  }
}

async function run() {
  await diagnose('http://localhost:8081/watch?id=anilist-1639&ep=2');
  await diagnose('http://localhost:8081/watch?id=anilist-207141&ep=2');
}

run();
