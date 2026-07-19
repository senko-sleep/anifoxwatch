import { performance } from 'perf_hooks';
import puppeteer from 'puppeteer';

const API_BASE = 'http://localhost:3001';
const TEST_EPISODES = [
  'anilist-21', // One Piece
  'anilist-20', // Naruto Shippuden
  'anilist-101922', // Demon Slayer
];

async function testPlaybackPerformance(episodeId: string): Promise<{ 
  success: boolean; 
  totalTime: number; 
  fetchTime: number; 
  manifestTime: number; 
  fragmentTime: number;
  logs: string[];
  error?: string;
}> {
  const browser = await puppeteer.launch({ headless: false }); // Run with visible browser for debugging
  const page = await browser.newPage();
  
  const startTime = performance.now();
  let fetchTime = 0;
  let manifestTime = 0;
  let fragmentTime = 0;
  const logs: string[] = [];
  
  try {
    // Set up detailed console logging
    page.on('console', (msg) => {
      const text = msg.text();
      logs.push(`[CONSOLE] ${text}`);
      console.log(`[BROWSER] ${text}`);
      
      if (text.includes('Stream fetch:')) {
        const match = text.match(/Stream fetch:\s*(\d+)ms/);
        if (match) fetchTime = parseInt(match[1]);
      }
      if (text.includes('Manifest parsed:')) {
        const match = text.match(/Manifest parsed:\s*(\d+)ms/);
        if (match) manifestTime = parseInt(match[1]);
      }
      if (text.includes('First fragment loaded:')) {
        const match = text.match(/First fragment loaded:\s*(\d+)ms/);
        if (match) fragmentTime = parseInt(match[1]);
      }
    });
    
    // Set up error logging
    page.on('pageerror', (error) => {
      logs.push(`[ERROR] ${error.message}`);
      console.error(`[BROWSER ERROR] ${error.message}`);
    });
    
    // Set up request logging
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('stream') || url.includes('.m3u8')) {
        logs.push(`[REQUEST] ${request.method()} ${url}`);
        console.log(`[REQUEST] ${request.method()} ${url.substring(0, 80)}...`);
      }
    });
    
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('stream') || url.includes('.m3u8')) {
        logs.push(`[RESPONSE] ${response.status()} ${url}`);
        console.log(`[RESPONSE] ${response.status()} ${url.substring(0, 80)}...`);
      }
    });
    
    // Navigate to test page via Vite dev server
    console.log(`[TEST] Navigating to test page via http://localhost:8081...`);
    await page.goto(`http://localhost:8081/test-frontend-playback.html`, { waitUntil: 'networkidle0' });
    
    // Wait for page to load
    await page.waitForSelector('video', { timeout: 5000 });
    console.log(`[TEST] Page loaded, starting playback test for ${episodeId}...`);
    
    // Click the test button
    await page.evaluate((id) => {
      window.testPlayback(id);
    }, episodeId);
    
    // Wait for first fragment to load (max 20 seconds)
    console.log(`[TEST] Waiting for first fragment to load...`);
    await page.waitForFunction(() => {
      return document.body.textContent.includes('First fragment loaded') || 
             document.body.textContent.includes('Error') ||
             document.body.textContent.includes('PASS') ||
             document.body.textContent.includes('FAIL');
    }, { timeout: 20000 });
    
    const totalTime = performance.now() - startTime;
    const pageContent = await page.evaluate(() => document.body.textContent);
    
    console.log(`[TEST] Page content: ${pageContent.substring(0, 500)}...`);
    
    // Wait a bit more to see if video actually plays
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await browser.close();
    
    // Check for actual success/failure based on timing data
    if (fragmentTime > 0 && manifestTime > 0) {
      return {
        success: true,
        totalTime,
        fetchTime,
        manifestTime,
        fragmentTime,
        logs
      };
    }
    
    // Check for actual errors (not template literals)
    if (pageContent.includes('✗ Error:') && !pageContent.includes('${data.type}')) {
      const errorMatch = pageContent.match(/✗ Error: ([^\n]+)/);
      return {
        success: false,
        totalTime,
        fetchTime,
        manifestTime,
        fragmentTime,
        logs,
        error: errorMatch ? errorMatch[1] : 'Unknown error'
      };
    }
    
    // If we have timing data but no explicit success/failure, consider it success
    if (fetchTime > 0 || manifestTime > 0) {
      return {
        success: true,
        totalTime,
        fetchTime,
        manifestTime,
        fragmentTime,
        logs
      };
    }
    
    return {
      success: false,
      totalTime,
      fetchTime,
      manifestTime,
      fragmentTime,
      logs,
      error: 'No timing data collected'
    };
    
  } catch (error: any) {
    console.error(`[TEST ERROR] ${error.message}`);
    await browser.close();
    const totalTime = performance.now() - startTime;
    return {
      success: false,
      totalTime,
      fetchTime,
      manifestTime,
      fragmentTime,
      logs,
      error: error.message
    };
  }
}

async function runPlaybackTests() {
  console.log('🎬 Starting detailed frontend playback performance tests...\n');
  console.log('=' .repeat(80));
  
  for (const episodeId of TEST_EPISODES) {
    console.log(`\n📺 Testing: ${episodeId}`);
    console.log('-'.repeat(80));
    
    const result = await testPlaybackPerformance(episodeId);
    
    console.log('\n📊 Results:');
    console.log(`   Total Time: ${result.totalTime.toFixed(0)}ms (${(result.totalTime/1000).toFixed(2)}s)`);
    console.log(`   Fetch Time: ${result.fetchTime}ms`);
    console.log(`   Manifest Time: ${result.manifestTime}ms`);
    console.log(`   Fragment Time: ${result.fragmentTime}ms`);
    
    if (result.success) {
      const status = result.totalTime < 12000 ? '✅ PASS' : '❌ FAIL';
      console.log(`   Status: ${status} (Target: < 12s)`);
    } else {
      console.log(`   Status: ❌ FAILED`);
      console.log(`   Error: ${result.error}`);
    }
    
    console.log('\n📝 Logs:');
    result.logs.slice(-10).forEach(log => console.log(`   ${log}`));
    
    console.log('\n' + '='.repeat(80));
  }
  
  console.log('\n📊 Test complete. Target: < 12s (12000ms)');
}

runPlaybackTests().catch(console.error);
