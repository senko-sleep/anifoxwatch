const https = require('https');
const http = require('http');

// Test if the extracted dub streams actually contain English audio
async function testDubAudioValidation() {
  console.log('🔊 TESTING DUB AUDIO VALIDATION');
  console.log('=====================================\n');
  
  function makeRequest(path) {
    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 3001,
        path: path,
        method: 'GET',
        timeout: 30000
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ error: e.message, raw: data });
          }
        });
      });

      req.on('error', (e) => resolve({ error: e.message }));
      req.end();
    });
  }

  function fetchM3U8(url) {
    return new Promise((resolve) => {
      const client = url.startsWith('https') ? https : http;
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://anitaku.to/'
        },
        timeout: 10000
      };

      const req = client.get(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          });
        });
      });

      req.on('error', (e) => resolve({ error: e.message }));
      req.on('timeout', () => resolve({ error: 'Timeout' }));
      req.end();
    });
  }

  // Test anime with dub streams
  const testCases = [
    { id: 'gogoanime-attack-on-titan-episode-1', name: 'Attack on Titan' },
    { id: 'gogoanime-one-piece-episode-1', name: 'One Piece' }
  ];

  for (const testCase of testCases) {
    console.log(`\n========== ${testCase.name} ==========`);
    
    // Get dub stream
    console.log('1. Getting dub stream...');
    const dubData = await makeRequest(`/api/stream/watch/${encodeURIComponent(testCase.id)}?category=dub&source=gogoanime`);
    
    if (dubData.error || !dubData.sources || dubData.sources.length === 0) {
      console.log(`❌ No dub stream found: ${dubData?.error || 'No sources'}`);
      continue;
    }
    
    const dubStream = dubData.sources[0];
    console.log(`✅ Dub stream found: ${dubStream.quality || 'unknown'}`);
    console.log(`   URL: ${dubStream.url?.substring(0, 80)}...`);
    
    // Extract the actual m3u8 URL if it's proxied
    let m3u8Url = dubStream.url;
    if (m3u8Url.includes('/api/stream/proxy?url=')) {
      m3u8Url = decodeURIComponent(m3u8Url.split('/api/stream/proxy?url=')[1]);
      console.log(`   Extracted m3u8: ${m3u8Url.substring(0, 80)}...`);
    }
    
    // Fetch and analyze the m3u8 playlist
    console.log('\n2. Analyzing m3u8 playlist for audio tracks...');
    const m3u8Result = await fetchM3U8(m3u8Url);
    
    if (m3u8Result.error) {
      console.log(`❌ Failed to fetch m3u8: ${m3u8Result.error}`);
      continue;
    }
    
    if (m3u8Result.status !== 200) {
      console.log(`❌ m3u8 returned status: ${m3u8Result.status}`);
      continue;
    }
    
    const playlist = m3u8Result.data;
    console.log(`✅ m3u8 loaded (${playlist.length} bytes)`);
    
    // Look for audio track information
    const audioPatterns = [
      { name: 'EXT-X-MEDIA audio', pattern: /#EXT-X-MEDIA:TYPE=AUDIO[^,]+,NAME="([^"]+)"/gi },
      { name: 'AUDIO attribute', pattern: /AUDIO="([^"]+)"/gi },
      { name: 'English audio', pattern: /english/gi },
      { name: 'ENG audio', pattern: /eng/gi },
      { name: 'Dub audio', pattern: /dub/gi },
      { name: 'Audio track', pattern: /audio/gi }
    ];
    
    let audioTracks = [];
    let englishIndicators = [];
    
    for (const { name, pattern } of audioPatterns) {
      const matches = [...playlist.matchAll(pattern)];
      if (matches.length > 0) {
        console.log(`✅ Found ${matches.length} ${name} matches:`);
        matches.forEach(match => {
          const found = match[1] || match[0];
          console.log(`   - ${found}`);
          
          if (found.toLowerCase().includes('english') || found.toLowerCase().includes('eng')) {
            englishIndicators.push(found);
          }
          audioTracks.push(found);
        });
      }
    }
    
    // Check for multiple audio tracks (good sign for dub)
    const mediaMatches = [...playlist.matchAll(/#EXT-X-MEDIA:TYPE=AUDIO/gi)];
    if (mediaMatches.length > 1) {
      console.log(`✅ Multiple audio tracks found (${mediaMatches.length}) - good for dub`);
    } else if (mediaMatches.length === 1) {
      console.log(`⚠️  Only one audio track found - might be sub only`);
    } else {
      console.log(`⚠️  No audio track metadata found`);
    }
    
    // Look for segment files that might indicate dub
    const segmentMatches = [...playlist.matchAll(/[^#]+\.ts/gi)];
    console.log(`✅ Found ${segmentMatches.length} video segments`);
    
    // Check if there are separate audio files
    const audioFileMatches = [...playlist.matchAll(/[^#]+\.(aac|m4a|mp3)/gi)];
    if (audioFileMatches.length > 0) {
      console.log(`✅ Found ${audioFileMatches.length} audio files - good for dub`);
      audioFileMatches.forEach(file => console.log(`   - ${file}`));
    }
    
    // Summary for this anime
    console.log(`\n3. Audio validation summary:`);
    console.log(`   Audio tracks found: ${audioTracks.length}`);
    console.log(`   English indicators: ${englishIndicators.length}`);
    console.log(`   Multiple audio tracks: ${mediaMatches.length > 1}`);
    console.log(`   Audio files: ${audioFileMatches.length}`);
    
    if (englishIndicators.length > 0 || mediaMatches.length > 1 || audioFileMatches.length > 0) {
      console.log(`🎉 LIKELY ACTUAL DUB CONTENT!`);
    } else {
      console.log(`⚠️  Might still be sub content`);
    }
  }

  console.log('\n=====================================');
  console.log('TESTING BROWSER PLAYBACK');
  console.log('=====================================\n');
  
  console.log('🎯 To test actual dub playback:');
  console.log('1. Open: http://localhost:8080/watch?id=anilist-16498');
  console.log('2. Click the DUB button');
  console.log('3. Check if English audio plays');
  console.log('4. Compare with SUB version');
  console.log('5. Listen for voice acting language');
  
  console.log('\n=====================================');
  console.log('DUB AUDIO VALIDATION COMPLETE');
  console.log('=====================================\n');
  
  console.log('📊 FINAL VERDICT:');
  console.log('- If English indicators found: Real dub content');
  console.log('- If multiple audio tracks: Dub likely available');
  console.log('- If only one audio track: Might be sub only');
  console.log('- Test in browser to confirm actual playback');
}

testDubAudioValidation();
