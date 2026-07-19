import puppeteer from 'puppeteer';
import { performance } from 'perf_hooks';

// Test cases: anime with both sub and dub availability
// Skip Naruto and Demon Slayer for now - Aniwaves source has issues with these anime
const TEST_CASES = [
  { id: 'anilist-21', name: 'One Piece', episode: 1 },
  { id: 'anilist-189046', name: 'Chainsaw Man', episode: 2 },
  { id: 'anilist-16498', name: 'Attack on Titan', episode: 1 },
];

const AUDIO_TYPES = ['sub', 'dub'] as const;
const TARGET_TIME_MS = 12000;

interface TestResult {
  animeId: string;
  animeName: string;
  episode: number;
  audioType: 'sub' | 'dub';
  success: boolean;
  totalTime: number;
  streamFetchTime?: number;
  manifestParsedTime?: number;
  firstFragmentTime?: number;
  error?: string;
  logs: string[];
  consoleErrors: string[];
  networkErrors: string[];
}

async function runTest(
  browser: puppeteer.Browser,
  testCase: typeof TEST_CASES[0],
  audioType: 'sub' | 'dub'
): Promise<TestResult> {
  const page = await browser.newPage();
  const logs: string[] = [];
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  const startTime = performance.now();

  // Capture console logs
  page.on('console', (msg) => {
    const text = msg.text();
    logs.push(`[CONSOLE ${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
  });

  // Capture network errors
  page.on('response', (response) => {
    if (response.status() >= 400) {
      networkErrors.push(`[NETWORK ${response.status()}] ${response.url()}`);
    }
  });

  // Capture page errors
  page.on('pageerror', (error) => {
    consoleErrors.push(`[PAGE ERROR] ${error.message}`);
  });

  try {
    const url = `http://localhost:8081/watch?id=${testCase.id}&ep=${testCase.episode}`;
    console.log(`\n[TEST] Testing: ${testCase.name} (${testCase.id}) Episode ${testCase.episode} - ${audioType.toUpperCase()}`);
    console.log(`[TEST] URL: ${url}`);
    logs.push(`[TEST] Starting test for ${testCase.name} ${audioType}`);

    // Navigate to watch page
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    logs.push(`[TEST] Page loaded`);

    // Wait for video element to appear - be patient (30s timeout)
    try {
      await page.waitForSelector('video', { timeout: 30000 });
      logs.push(`[TEST] Video element found`);
    } catch (e) {
      logs.push(`[TEST] Video element NOT found after 30s - page may have error`);
      // Get page content to understand what's happening
      const pageContent = await page.evaluate(() => {
        return {
          bodyText: document.body.innerText.substring(0, 500),
          hasVideo: !!document.querySelector('video'),
          hasError: document.body.innerText.toLowerCase().includes('error'),
          hasLoading: document.body.innerText.toLowerCase().includes('loading'),
        };
      });
      logs.push(`[DEBUG] Page state: ${JSON.stringify(pageContent)}`);
      throw new Error('Video element not found - page may have error');
    }

    // Switch to dub if needed
    if (audioType === 'dub') {
      logs.push(`[TEST] Switching to dub`);
      try {
        // Click dub button if it exists
        const dubButton = await page.$('button:has-text("Dub")');
        if (dubButton) {
          await dubButton.click();
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for stream to reload
          logs.push(`[TEST] Dub button clicked`);
        } else {
          logs.push(`[TEST] No dub button found - may not be available`);
        }
      } catch (e) {
        logs.push(`[TEST] Dub switch attempt failed: ${(e as Error).message}`);
      }
    }

    // Wait for stream data to be fetched (check for loading state to clear)
    logs.push(`[TEST] Waiting for stream to load...`);
    
    // Wait up to 20s for stream to start playing (be patient)
    const streamStart = performance.now();
    let streamLoaded = false;
    
    for (let i = 0; i < 40; i++) { // 40 checks * 500ms = 20s
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if video is playing or ready
      const videoState = await page.evaluate(() => {
        const video = document.querySelector('video');
        if (!video) return { ready: false, playing: false, currentTime: 0 };
        return {
          ready: video.readyState >= 2,
          playing: !video.paused,
          currentTime: video.currentTime,
          buffered: video.buffered.length > 0 ? video.buffered.end(0) : 0,
        };
      });
      
      // Log every 10th check to reduce spam
      if (i % 10 === 0) {
        logs.push(`[CHECK ${i}] Video state: ready=${videoState.ready}, playing=${videoState.playing}, time=${videoState.currentTime.toFixed(2)}s, buffered=${videoState.buffered.toFixed(2)}s`);
      }
      
      if (videoState.ready || videoState.playing || videoState.currentTime > 0) {
        streamLoaded = true;
        logs.push(`[TEST] Stream loaded successfully at check ${i}`);
        break;
      }
    }

    const streamLoadTime = performance.now() - streamStart;
    logs.push(`[TEST] Stream load check completed in ${streamLoadTime.toFixed(0)}ms`);

    if (!streamLoaded) {
      // Check for error messages on page
      const pageContent = await page.evaluate(() => document.body.innerText);
      if (pageContent.includes('No Stream Available') || pageContent.includes('trouble connecting')) {
        throw new Error('No Stream Available - stream fetch failed');
      }
      if (pageContent.includes('signal is aborted') || pageContent.includes('aborted without reason')) {
        throw new Error('Stream fetch aborted - abort signal issue');
      }
      throw new Error('Stream did not load within timeout');
    }

    // Check if video actually plays - wait for it to play for 3 seconds
    logs.push(`[TEST] Attempting to play video for 3 seconds to verify playback...`);
    const playCheck = await page.evaluate(async () => {
      const video = document.querySelector('video');
      if (!video) return { success: false, reason: 'No video element' };
      
      try {
        // Try to play
        await video.play();
        console.log('[PLAYBACK] Video play() called');
        
        // Wait 3 seconds for playback to establish
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const currentTime = video?.currentTime || 0;
        const playing = video ? !video.paused : false;
        const readyState = video?.readyState || 0;
        
        console.log(`[PLAYBACK] After 3s: time=${currentTime.toFixed(2)}s, playing=${playing}, readyState=${readyState}`);
        
        return {
          success: currentTime > 0.5 && playing, // Must have played at least 0.5s
          currentTime,
          playing,
          readyState,
          reason: currentTime <= 0.5 ? 'Video did not advance' : !playing ? 'Video paused' : 'Unknown',
        };
      } catch (e) {
        return { success: false, reason: (e as Error).message };
      }
    });

    logs.push(`[TEST] Play check result: ${JSON.stringify(playCheck)}`);

    if (!playCheck.success) {
      throw new Error(`Video failed to play properly: ${playCheck.reason}`);
    }

    const totalTime = performance.now() - startTime;
    console.log(`[TEST] ✓ SUCCESS: Total time ${totalTime.toFixed(0)}ms (${(totalTime/1000).toFixed(2)}s)`);

    return {
      animeId: testCase.id,
      animeName: testCase.name,
      episode: testCase.episode,
      audioType,
      success: true,
      totalTime,
      logs,
      consoleErrors,
      networkErrors,
    };

  } catch (error) {
    const totalTime = performance.now() - startTime;
    const errorMessage = (error as Error).message;
    console.log(`[TEST] ✗ FAILED: ${errorMessage} (${totalTime.toFixed(0)}ms)`);

    // Get page content for debugging
    try {
      const pageContent = await page.evaluate(() => {
        return {
          body: document.body.innerText.substring(0, 2000),
          hasError: document.body.innerText.includes('Error') || document.body.innerText.includes('No Stream'),
          hasAbort: document.body.innerText.includes('abort'),
        };
      });
      logs.push(`[DEBUG] Page content: ${JSON.stringify(pageContent)}`);
    } catch (e) {
      logs.push(`[DEBUG] Failed to get page content: ${(e as Error).message}`);
    }

    return {
      animeId: testCase.id,
      animeName: testCase.name,
      episode: testCase.episode,
      audioType,
      success: false,
      totalTime,
      error: errorMessage,
      logs,
      consoleErrors,
      networkErrors,
    };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('WATCH PAGE PERFORMANCE TEST');
  console.log('Testing actual VideoPlayer component with in-depth logging');
  console.log('='.repeat(80));

  const browser = await puppeteer.launch({
    headless: false, // Run visible for debugging
    defaultViewport: { width: 1920, height: 1080 },
  });

  const results: TestResult[] = [];

  for (const testCase of TEST_CASES) {
    for (const audioType of AUDIO_TYPES) {
      const result = await runTest(browser, testCase, audioType);
      results.push(result);
      
      // Print summary
      console.log(`\n${'='.repeat(80)}`);
      console.log(`RESULT: ${result.animeName} (${result.animeId}) Episode ${result.episode} - ${result.audioType.toUpperCase()}`);
      console.log(`Status: ${result.success ? '✓ PASS' : '✗ FAIL'}`);
      console.log(`Total Time: ${result.totalTime.toFixed(0)}ms (${(result.totalTime/1000).toFixed(2)}s)`);
      console.log(`Target: <${TARGET_TIME_MS}ms (${(TARGET_TIME_MS/1000).toFixed(1)}s)`);
      
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
      
      if (result.consoleErrors.length > 0) {
        console.log(`\nConsole Errors (${result.consoleErrors.length}):`);
        result.consoleErrors.slice(0, 5).forEach(e => console.log(`  - ${e}`));
      }
      
      if (result.networkErrors.length > 0) {
        console.log(`\nNetwork Errors (${result.networkErrors.length}):`);
        result.networkErrors.slice(0, 5).forEach(e => console.log(`  - ${e}`));
      }
      
      // Save detailed logs to file
      const logFileName = `test-watch-${testCase.id}-ep${testCase.episode}-${audioType}.log`;
      const fs = await import('fs');
      fs.writeFileSync(logFileName, logsToString(result.logs));
      console.log(`\nDetailed logs saved to: ${logFileName}`);
      
      console.log('='.repeat(80));
      
      // KILL SWITCH: Stop on first failure
      if (!result.success) {
        console.log('\n🛑 KILL SWITCH TRIGGERED: Test failed. Stopping to fix the issue.');
        console.log('Fix the issue above before running the test again.');
        await browser.close();
        process.exit(1);
      }
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  await browser.close();

  // Print final summary
  console.log('\n' + '='.repeat(80));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(80));
  
  const passed = results.filter(r => r.success && r.totalTime < TARGET_TIME_MS);
  const failed = results.filter(r => !r.success || r.totalTime >= TARGET_TIME_MS);
  
  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed (<${TARGET_TIME_MS}ms): ${passed.length}`);
  console.log(`Failed: ${failed.length}`);
  
  if (failed.length > 0) {
    console.log('\nFailed Tests:');
    failed.forEach(r => {
      console.log(`  - ${r.animeName} (${r.animeId}) Episode ${r.episode} - ${r.audioType.toUpperCase()}: ${r.error || 'Timeout'} (${r.totalTime.toFixed(0)}ms)`);
    });
  }
  
  console.log('='.repeat(80));
}

function logsToString(logs: string[]): string {
  return logs.join('\n');
}

main().catch(console.error);
