import { writeFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

async function downloadStream() {
    console.log('Getting stream URL from API...');
    
    // Get the stream URL from the API
    const response = await fetch('http://localhost:3001/api/stream/watch/anilist-189046?ep=11');
    const data = await response.json();
    
    if (!data.sources?.length) {
        console.error('No streaming sources found');
        process.exit(1);
    }
    
    // Use the proxy URL to get the actual HLS manifest
    const proxyUrl = data.sources[0].url;
    console.log(`Proxy URL: ${proxyUrl}`);
    
    // Get the actual HLS manifest URL by following the proxy
    const manifestResponse = await fetch(`http://localhost:3001${proxyUrl}`);
    const manifestContent = await manifestResponse.text();
    
    console.log('Manifest content (first 500 chars):');
    console.log(manifestContent.substring(0, 500));
    
    // Extract the base URL from the manifest
    const lines = manifestContent.split('\n');
    const baseUrl = proxyUrl.split('/api/stream/proxy')[0];
    const manifestBaseUrl = data.sources[0].originalUrl.split('/').slice(0, -1).join('/');
    
    console.log(`\nBase URL: ${manifestBaseUrl}`);
    
    // Check if ffmpeg is available
    try {
        await execAsync('ffmpeg -version');
        console.log('✅ ffmpeg found');
    } catch {
        console.error('❌ ffmpeg not found. Creating HTML test page instead...');
        createHtmlTestPage(proxyUrl, data);
        return;
    }
    
    // Use ffmpeg to download the HLS stream
    console.log('\nDownloading HLS stream with ffmpeg...');
    console.log('This may take several minutes...');
    
    try {
        // Use the proxy URL directly with ffmpeg
        const fullUrl = `http://localhost:3001${proxyUrl}`;
        const output = 'test.mp4';
        
        const command = `ffmpeg -i "${fullUrl}" -c copy -bsf:a aac_adtstoasc "${output}" -y`;
        console.log(`Running: ${command}`);
        
        await execAsync(command);
        
        console.log(`\n✅ Download complete! Saved as ${output}`);
        
        // Get file size
        const { size } = await import('fs').then(fs => fs.statSync(output));
        console.log(`File size: ${(size / 1024 / 1024).toFixed(2)} MB`);
        
    } catch (error: any) {
        console.error(`Download failed: ${error.message}`);
        
        // Fallback: try downloading with the original URL
        console.log('\nTrying direct download with original URL...');
        const originalUrl = data.sources[0].originalUrl;
        console.log(`Original URL: ${originalUrl}`);
        
        const command2 = `ffmpeg -headers "Referer: https://aniwaves.ru" -i "${originalUrl}" -c copy -bsf:a aac_adtstoasc "test.mp4" -y`;
        console.log(`Running: ${command2}`);
        
        await execAsync(command2);
        console.log(`\n✅ Download complete! Saved as test.mp4`);
    }
}

function createHtmlTestPage(proxyUrl: string, data: any) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stream Test - Re:Zero Episode 11</title>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #1a1a2e;
            color: #eee;
        }
        .container {
            background: #16213e;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        video {
            width: 100%;
            max-height: 70vh;
            background: #000;
        }
        .controls {
            margin: 20px 0;
            padding: 15px;
            background: #0f3460;
            border-radius: 8px;
        }
        button {
            padding: 10px 20px;
            margin: 5px;
            background: #e94560;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
        }
        button:hover {
            background: #ff6b6b;
        }
        .info {
            background: #0f3460;
            padding: 15px;
            border-radius: 8px;
            margin: 10px 0;
        }
        .info p {
            margin: 5px 0;
        }
        .status {
            padding: 10px;
            margin: 10px 0;
            border-radius: 5px;
            background: #1a1a2e;
        }
        .success { background: #2d6a4f; }
        .error { background: #c1121f; }
    </style>
</head>
<body>
    <h1>🎬 Stream Test - Re:Zero Episode 11</h1>
    
    <div class="container">
        <video id="video" controls crossorigin="anonymous"></video>
    </div>
    
    <div class="controls">
        <h3>⏱️ Seek/Jump Tests</h3>
        <button onclick="seekTo(0)">Jump to 0:00</button>
        <button onclick="seekTo(60)">Jump to 1:00</button>
        <button onclick="seekTo(300)">Jump to 5:00</button>
        <button onclick="seekTo(600)">Jump to 10:00</button>
        <button onclick="seekTo(900)">Jump to 15:00</button>
        <button onclick="seekTo(1200)">Jump to 20:00</button>
        <button onclick="togglePlay()">Toggle Play/Pause</button>
    </div>
    
    <div class="info">
        <h3>📊 Stream Info</h3>
        <p><strong>Source:</strong> ${data.source || 'Unknown'}</p>
        <p><strong>Quality:</strong> ${data.sources[0]?.quality || 'Unknown'}</p>
        <p><strong>Category:</strong> ${data.category || 'Unknown'}</p>
        <p><strong>Proxy URL:</strong> ${proxyUrl}</p>
    </div>
    
    <div class="info">
        <h3>🎯 Current Status</h3>
        <div id="status" class="status">Initializing...</div>
        <p>Current Time: <span id="currentTime">0:00</span></p>
        <p>Duration: <span id="duration">0:00</span></p>
    </div>
    
    <script>
        const video = document.getElementById('video');
        const statusDiv = document.getElementById('status');
        const currentTimeSpan = document.getElementById('currentTime');
        const durationSpan = document.getElementById('duration');
        
        const streamUrl = 'http://localhost:3001${proxyUrl}';
        
        if (Hls.isSupported()) {
            const hls = new Hls({
                debug: true,
                enableWorker: true,
                lowLatencyMode: true,
            });
            
            hls.loadSource(streamUrl);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                statusDiv.textContent = '✅ Manifest loaded - Ready to play!';
                statusDiv.className = 'status success';
                console.log('Manifest parsed successfully');
            });
            
            hls.on(Hls.Events.ERROR, function(event, data) {
                if (data.fatal) {
                    statusDiv.textContent = '❌ Error: ' + data.type + ' - ' + data.details;
                    statusDiv.className = 'status error';
                    console.error('HLS Error:', data);
                }
            });
            
            hls.on(Hls.Events.FRAG_LOADED, function(event, data) {
                console.log('Fragment loaded:', data.frag.url);
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = streamUrl;
            video.addEventListener('loadedmetadata', function() {
                statusDiv.textContent = '✅ Native HLS support - Ready to play!';
                statusDiv.className = 'status success';
            });
        } else {
            statusDiv.textContent = '❌ HLS not supported in this browser';
            statusDiv.className = 'status error';
        }
        
        function seekTo(seconds) {
            video.currentTime = seconds;
            console.log('Seeked to:', seconds);
        }
        
        function togglePlay() {
            if (video.paused) {
                video.play();
            } else {
                video.pause();
            }
        }
        
        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return mins + ':' + (secs < 10 ? '0' : '') + secs;
        }
        
        video.addEventListener('timeupdate', function() {
            currentTimeSpan.textContent = formatTime(video.currentTime);
        });
        
        video.addEventListener('loadedmetadata', function() {
            durationSpan.textContent = formatTime(video.duration);
        });
        
        video.addEventListener('play', function() {
            console.log('Video playing');
        });
        
        video.addEventListener('pause', function() {
            console.log('Video paused');
        });
        
        video.addEventListener('seeked', function() {
            console.log('Seek completed to:', video.currentTime);
            statusDiv.textContent = '✅ Seek successful!';
            statusDiv.className = 'status success';
        });
        
        video.addEventListener('error', function(e) {
            console.error('Video error:', e);
            statusDiv.textContent = '❌ Video error: ' + video.error?.message;
            statusDiv.className = 'status error';
        });
    </script>
</body>
</html>`;

    fs.writeFileSync('stream-test.html', html);
    console.log('✅ Created stream-test.html');
    console.log('Open this file in your browser to test the stream!');
    console.log('It will test playback and seeking functionality.');
}

downloadStream().catch(console.error);
