export default async function run(page, ui) {
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
    if (u.includes('/api/') || u.includes('/watch') || u.includes('m3u8') || u.includes('stream')) {
      const status = resp.status();
      console.log(`[API RESPONSE ${status}] ${u}`);
      apiRequests.push({ url: u, status });
    }
  });

  console.log('Waiting 10s for video player and sources...');
  await page.waitForTimeout(10000);

  const playerInfo = await page.evaluate(() => {
    const video = document.querySelector('video');
    const iframe = document.querySelector('iframe');
    const errorElem = document.querySelector('[class*="error"], [class*="Alert"]');
    return {
      title: document.title,
      videoSrc: video ? video.src : null,
      videoCurrentTime: video ? video.currentTime : null,
      videoPaused: video ? video.paused : null,
      videoReadyState: video ? video.readyState : null,
      videoError: video && video.error ? { code: video.error.code, message: video.error.message } : null,
      iframeSrc: iframe ? iframe.src : null,
      errorElemText: errorElem ? errorElem.innerText : null,
      bodyText: document.body.innerText.slice(0, 500)
    };
  });

  return {
    playerInfo,
    consoleLogs,
    networkErrors,
    apiRequests
  };
}
