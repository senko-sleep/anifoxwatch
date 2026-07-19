/**
 * Video download test - downloads 30 seconds of video to test buffering
 * This tests the actual video stream quality and download speed
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const DOWNLOAD_DIR = path.join(process.cwd(), 'testing', 'downloads');

interface DownloadTestResult {
  name: string;
  passed: boolean;
  duration: number;
  bytesDownloaded: number;
  speed: number; // bytes per second
  error?: string;
}

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

async function downloadVideo(
  name: string,
  streamUrl: string,
  durationSeconds: number = 30
): Promise<DownloadTestResult> {
  const start = Date.now();
  let bytesDownloaded = 0;
  let lastProgressUpdate = start;
  
  try {
    // First, get the streaming URL from the API
    console.log(`Fetching stream URL for: ${name}`);
    const streamResponse = await fetch(streamUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30000)
    });
    
    if (!streamResponse.ok) {
      throw new Error(`Stream API failed: ${streamResponse.status}`);
    }
    
    const streamData = await streamResponse.json();
    
    if (!streamData.sources || streamData.sources.length === 0) {
      throw new Error('No sources found in stream response');
    }
    
    let videoUrl = streamData.sources[0].url;
    
    // Convert relative proxy URLs to absolute URLs
    if (videoUrl.startsWith('/api/stream/proxy')) {
      videoUrl = `${API_BASE}${videoUrl}`;
      console.log(`Converting proxy URL to absolute: ${videoUrl.substring(0, 100)}...`);
    }
    
    console.log(`Video URL: ${videoUrl.substring(0, 100)}...`);
    
    // Download through the proxy for specified duration to test actual buffering performance
    const url = new URL(videoUrl);
    const protocol = url.protocol === 'https:' ? https : http;
    
    const filename = path.join(DOWNLOAD_DIR, `${name.replace(/[^a-z0-9]/gi, '_')}.ts`);
    const fileStream = fs.createWriteStream(filename);
    
    await new Promise<void>((resolve, reject) => {
      const req = protocol.get(videoUrl, (res: any) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        
        const startTime = Date.now();
        const targetDuration = durationSeconds * 1000;
        let isM3U8 = false;
        
        // Check if we're downloading an m3u8 manifest
        res.on('data', (chunk: Buffer) => {
          const dataStr = chunk.toString();
          if (dataStr.includes('#EXTM3U') || dataStr.includes('.m3u8')) {
            isM3U8 = true;
          }
        });
        
        res.on('data', (chunk: Buffer) => {
          bytesDownloaded += chunk.length;
          fileStream.write(chunk);
          
          // Progress update every 5 seconds
          const now = Date.now();
          if (now - lastProgressUpdate > 5000) {
            const elapsed = (now - startTime) / 1000;
            const speed = bytesDownloaded / elapsed;
            console.log(`  Downloaded: ${(bytesDownloaded / 1024 / 1024).toFixed(2)} MB, Speed: ${(speed / 1024 / 1024).toFixed(2)} MB/s${isM3U8 ? ' (m3u8 manifest)' : ''}`);
            lastProgressUpdate = now;
          }
          
          // Stop after target duration or if we've downloaded enough m3u8 data
          if (Date.now() - startTime >= targetDuration || (isM3U8 && bytesDownloaded > 50000)) {
            console.log(`  Target duration reached (${durationSeconds}s), stopping download`);
            req.destroy();
            fileStream.end();
            resolve();
          }
        });
        
        res.on('end', () => {
          fileStream.end();
          resolve();
        });
        
        res.on('error', (err: Error) => {
          fileStream.end();
          reject(err);
        });
      });
      
      req.on('error', reject);
      
      // Timeout safety
      setTimeout(() => {
        req.destroy();
        fileStream.end();
        resolve();
      }, (durationSeconds + 10) * 1000);
    });
    
    const duration = Date.now() - start;
    const speed = bytesDownloaded / (duration / 1000);
    
    // Clean up the downloaded file
    try {
      fs.unlinkSync(filename);
    } catch {}
    
    return {
      name,
      passed: bytesDownloaded > 0,
      duration,
      bytesDownloaded,
      speed
    };
  } catch (error) {
    const duration = Date.now() - start;
    return {
      name,
      passed: false,
      duration,
      bytesDownloaded,
      speed: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function runVideoTests() {
  console.log('=== Video Download Tests ===');
  console.log(`API Base: ${API_BASE}`);
  console.log(`Download duration: 30 seconds per video\n`);
  
  const tests = [
    {
      name: 'Re:Zero S4E11',
      url: `${API_BASE}/api/stream/watch/aniwaves-82570&eps=11`
    },
    {
      name: 'Demon Slayer Movie',
      url: `${API_BASE}/api/stream/watch/aniwaves-82311&eps=1`
    }
  ];
  
  const results: DownloadTestResult[] = [];
  
  for (const test of tests) {
    console.log(`\nTesting: ${test.name}`);
    const result = await downloadVideo(test.name, test.url, 30);
    results.push(result);
    
    if (result.passed) {
      console.log(`✅ ${test.name}: ${(result.bytesDownloaded / 1024 / 1024).toFixed(2)} MB downloaded at ${(result.speed / 1024 / 1024).toFixed(2)} MB/s`);
    } else {
      console.log(`❌ ${test.name}: ${result.error}`);
    }
  }
  
  // Summary
  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }
  
  console.log('\nPerformance:');
  results.forEach(r => {
    console.log(`  - ${r.name}: ${(r.bytesDownloaded / 1024 / 1024).toFixed(2)} MB in ${(r.duration / 1000).toFixed(2)}s (${(r.speed / 1024 / 1024).toFixed(2)} MB/s)`);
  });
  
  // Check for buffering issues
  console.log('\n=== Buffering Analysis ===');
  results.forEach(r => {
    if (r.passed && r.bytesDownloaded > 0) {
      const minSpeedForHD = 5 * 1024 * 1024; // 5 MB/s for 1080p
      const minSpeedFor720p = 2.5 * 1024 * 1024; // 2.5 MB/s for 720p
      const minSpeedFor480p = 1 * 1024 * 1024; // 1 MB/s for 480p
      const minSpeedForManifest = 100 * 1024; // 100 KB/s for m3u8 manifest loading
      
      // If we downloaded less than 1MB, it's likely a manifest
      const isManifest = r.bytesDownloaded < 1024 * 1024;
      
      if (isManifest) {
        if (r.speed >= minSpeedForManifest) {
          console.log(`✅ ${r.name}: Manifest download speed ${(r.speed / 1024).toFixed(2)} KB/s is sufficient for quick startup`);
        } else {
          console.log(`⚠️  ${r.name}: Manifest download speed ${(r.speed / 1024).toFixed(2)} KB/s may cause slow startup`);
        }
      } else {
        if (r.speed < minSpeedFor480p) {
          console.log(`⚠️  ${r.name}: Speed ${(r.speed / 1024 / 1024).toFixed(2)} MB/s is below minimum for 480p playback`);
        } else if (r.speed < minSpeedFor720p) {
          console.log(`⚠️  ${r.name}: Speed ${(r.speed / 1024 / 1024).toFixed(2)} MB/s is sufficient for 480p but may struggle with 720p`);
        } else if (r.speed < minSpeedForHD) {
          console.log(`✅ ${r.name}: Speed ${(r.speed / 1024 / 1024).toFixed(2)} MB/s is sufficient for 720p playback`);
        } else {
          console.log(`✅ ${r.name}: Speed ${(r.speed / 1024 / 1024).toFixed(2)} MB/s is excellent for HD playback`);
        }
      }
    } else if (r.passed) {
      console.log(`⚠️  ${r.name}: No data downloaded - connection may have failed`);
    }
  });
}

runVideoTests().catch(console.error);
