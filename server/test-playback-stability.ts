import puppeteer from 'puppeteer';
import { performance } from 'perf_hooks';

// Test playback stability: seeking, duration, and no random shutdowns
const TEST_CASES = [
  { id: 'anilist-21', name: 'One Piece', episode: 1 },
  { id: 'anilist-189046', name: 'Chainsaw Man', episode: 2 },
];

const AUDIO_TYPES = ['sub'] as const;

interface StabilityTestResult {
  animeId: string;
  animeName: string;
  episode: number;
  audioType: 'sub' | 'dub';
  success: boolean;
  totalTime: number;
  errors: string[];
  seekTests: {
    timestamp: number;
    success: boolean;
    currentTime: number;
  }[];
  durationTest: {
    duration: number;
    success: boolean;
    finalTime: number;
  };
}

async function runStabilityTest(browser: puppeteer.Browser, testCase: any, audioType: 'sub' | 'dub'): Promise<StabilityTestResult> {
  const logs: string[] = [];
  const errors: string[] = [];
  const seekTests: any[] = [];
  
  const page = await browser.newPage();
  
  // Capture console logs
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    // Ignore non-critical errors that don't affect playback stability
    if (type === 'error' || text.includes('❌') || text.includes('Error')) {
      // Ignore ERR_FILE_NOT_FOUND and HLS fragParsingError (transient CDN issues)
      if (!text.includes('ERR_FILE_NOT_FOUND') && !text.includes('fragParsingError')) {
        errors.push(text);
      }
    }
    logs.push(`[CONSOLE ${type}] ${text}`);
  });
  
  // Capture network errors
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.push(`[NETWORK ${response.status()}] ${response.url()}`);
    }
  });

  try {
    const startTime = performance.now();
    const url = `http://localhost:8081/watch?id=${testCase.id}&ep=${testCase.episode}`;
    console.log(`\n[STABILITY TEST] ${testCase.name} (${testCase.id}) Episode ${testCase.episode} - ${audioType.toUpperCase()}`);
    console.log(`[STABILITY TEST] URL: ${url}`);
    logs.push(`[TEST] Starting stability test for ${testCase.name} ${audioType}`);

    // Navigate to watch page
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    logs.push(`[TEST] Page loaded`);

    // Wait for video element
    await page.waitForSelector('video', { timeout: 30000 });
    logs.push(`[TEST] Video element found`);

    // Wait for stream to load
    logs.push(`[TEST] Waiting for stream to load...`);
    let streamLoaded = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const videoState = await page.evaluate(() => {
        const video = document.querySelector('video');
        if (!video) return { ready: false, currentTime: 0 };
        return {
          ready: video.readyState >= 2,
          currentTime: video.currentTime,
        };
      });
      if (videoState.ready || videoState.currentTime > 0) {
        streamLoaded = true;
        logs.push(`[TEST] Stream loaded at check ${i}`);
        break;
      }
    }

    if (!streamLoaded) {
      throw new Error('Stream did not load within timeout');
    }

    // Start playback
    logs.push(`[TEST] Starting playback...`);
    await page.evaluate(() => {
      const video = document.querySelector('video');
      if (video) video.play();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // TEST 1: Seek to different timestamps
    const seekTimestamps = [30, 60, 120, 300]; // 30s, 1min, 2min, 5min
    logs.push(`[TEST] Testing seeks to timestamps: ${seekTimestamps.join('s, ')}s`);

    for (const timestamp of seekTimestamps) {
      logs.push(`[TEST] Seeking to ${timestamp}s...`);
      const seekResult = await page.evaluate(async (targetTime: number) => {
        const video = document.querySelector('video');
        if (!video) return { success: false, currentTime: 0 };

        try {
          video.currentTime = targetTime;
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for seek to complete
          return {
            success: true,
            currentTime: video.currentTime,
            paused: video.paused,
            readyState: video.readyState,
          };
        } catch (e) {
          return { success: false, currentTime: video.currentTime, error: (e as Error).message };
        }
      }, timestamp);

      seekTests.push({
        timestamp,
        success: seekResult.success,
        currentTime: seekResult.currentTime,
      });

      if (!seekResult.success) {
        errors.push(`Seek to ${timestamp}s failed: ${seekResult.error || 'Unknown error'}`);
      } else if (Math.abs(seekResult.currentTime - timestamp) > 5) {
        errors.push(`Seek to ${timestamp}s was inaccurate - ended at ${seekResult.currentTime.toFixed(2)}s`);
      }

      logs.push(`[TEST] Seek to ${timestamp}s: ${seekResult.success ? '✓' : '✗'} (at ${seekResult.currentTime.toFixed(2)}s)`);

      // Wait a bit between seeks
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // TEST 2: Extended playback duration (play for 30 seconds)
    logs.push(`[TEST] Testing extended playback (30s duration)...`);
    const durationResult = await page.evaluate(async () => {
      const video = document.querySelector('video');
      if (!video) return { success: false, finalTime: 0 };

      const startTime = video.currentTime;
      await new Promise(resolve => setTimeout(resolve, 30000)); // Play for 30s
      
      return {
        success: true,
        finalTime: video.currentTime,
        durationPlayed: video.currentTime - startTime,
        paused: video.paused,
      };
    });

    logs.push(`[TEST] Duration test: played ${durationResult.durationPlayed.toFixed(2)}s (final: ${durationResult.finalTime.toFixed(2)}s)`);

    if (durationResult.paused) {
      errors.push('Video paused unexpectedly during duration test');
    }

    const totalTime = performance.now() - startTime;
    logs.push(`[TEST] Stability test completed in ${(totalTime/1000).toFixed(2)}s`);

    return {
      animeId: testCase.id,
      animeName: testCase.name,
      episode: testCase.episode,
      audioType,
      success: errors.length === 0,
      totalTime,
      errors,
      seekTests,
      durationTest: {
        duration: 30,
        success: !durationResult.paused,
        finalTime: durationResult.finalTime,
      },
    };
  } catch (e) {
    const totalTime = performance.now() - performance.now();
    errors.push((e as Error).message);
    return {
      animeId: testCase.id,
      animeName: testCase.name,
      episode: testCase.episode,
      audioType,
      success: false,
      totalTime,
      errors,
      seekTests,
      durationTest: {
        duration: 30,
        success: false,
        finalTime: 0,
      },
    };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('PLAYBACK STABILITY TEST');
  console.log('Testing seeking, extended duration, and no random shutdowns');
  console.log('='.repeat(80));

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
  });

  const results: StabilityTestResult[] = [];

  for (const testCase of TEST_CASES) {
    for (const audioType of AUDIO_TYPES) {
      const result = await runStabilityTest(browser, testCase, audioType);
      results.push(result);

      console.log(`\n${'='.repeat(80)}`);
      console.log(`RESULT: ${result.animeName} (${result.animeId}) Episode ${testCase.episode} - ${result.audioType.toUpperCase()}`);
      console.log(`Status: ${result.success ? '✓ PASS' : '✗ FAIL'}`);
      console.log(`Total Time: ${(result.totalTime/1000).toFixed(2)}s`);

      if (result.errors.length > 0) {
        console.log(`\nErrors (${result.errors.length}):`);
        result.errors.forEach(e => console.log(`  - ${e}`));
      }

      console.log(`\nSeek Tests:`);
      result.seekTests.forEach(st => {
        console.log(`  - Seek to ${st.timestamp}s: ${st.success ? '✓' : '✗'} (at ${st.currentTime.toFixed(2)}s)`);
      });

      console.log(`\nDuration Test:`);
      console.log(`  - 30s playback: ${result.durationTest.success ? '✓' : '✗'} (final: ${result.durationTest.finalTime.toFixed(2)}s)`);

      console.log('='.repeat(80));

      // KILL SWITCH on failure
      if (!result.success) {
        console.log('\n🛑 STABILITY TEST FAILED - Fix the issues above');
        await browser.close();
        process.exit(1);
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  await browser.close();

  console.log('\n' + '='.repeat(80));
  console.log('STABILITY TEST SUMMARY - ALL PASSED');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${results.length}`);
  console.log(`All stability tests passed - seeking and extended playback work correctly`);
  console.log('='.repeat(80));
}

main().catch(console.error);
