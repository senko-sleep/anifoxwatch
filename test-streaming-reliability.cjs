const http = require('http');
const https = require('https');
const { URL } = require('url');

const ANIME_LIST = [
  { name: 'Spy x Family', id: 'animekai-spy-x-family-season-3-v2q8$ep=1$token=c9m5qvHjvRW7mn4ey5SA' },
  { name: 'A Silent Voice', id: 'a-silent-voice-31-episode-1' },
  { name: 'Attack on Titan', id: 'attack-on-titan-112?ep=3303' },
  { name: 'Jujutsu Kaisen', id: 'jujutsu-kaisen-2nd-season-18413?ep=106368' },
  { name: 'One Piece', id: 'one-piece-21-episode-1' }
];

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { reject(new Error(`Failed to parse JSON: ${data.slice(0, 100)}`)); }
      });
    }).on('error', reject);
  });
}

async function fetchProxy(url, headers = {}) {
  const isHttps = url.startsWith('https');
  const client = isHttps ? https : http;
  return new Promise((resolve, reject) => {
    client.get(url, { headers }, (res) => {
      let data = Buffer.from([]);
      res.on('data', chunk => data = Buffer.concat([data, chunk]));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
    }).on('error', reject);
  });
}

async function runTest() {
  console.log('--- STARTING COMPREHENSIVE STREAM TEST ---\n');
  let successCount = 0;

  for (const anime of ANIME_LIST) {
    console.log(`\nTesting: ${anime.name}`);
    console.log(`Fetching streams for: ${anime.id}`);

    try {
      const category = anime.forceSub ? 'sub' : 'dub';
      const apiRes = await fetchJson(`http://localhost:3001/api/stream/watch/${encodeURIComponent(anime.id)}?category=${category}`);
      if (apiRes.status !== 200 || !apiRes.data.sources || apiRes.data.sources.length === 0) {
        console.error(`❌ Failed to get streams: ${JSON.stringify(apiRes.data)}`);
        continue;
      }

      console.log(`✅ Streams found (${apiRes.data.sources.length} sources). Primary server: ${apiRes.data.server}`);
      
      const primarySource = apiRes.data.sources[0];
      const streamUrl = primarySource.url;
      const isM3u8 = streamUrl.includes('.m3u8');
      
      console.log(`🎬 Primary URL: ${streamUrl.substring(0, 80)}...`);

      // 2. Fetch the manifest or video header via our local proxy
      const proxyBase = 'http://localhost:3001';
      const testUrl = streamUrl.startsWith('/') ? proxyBase + streamUrl : streamUrl;
      
      console.log(`🔄 Fetching ${isM3u8 ? 'manifest' : 'video bytes'} through proxy...`);
      const proxyRes = await fetchProxy(testUrl, isM3u8 ? {} : { 'Range': 'bytes=0-10000' });
      
      if (proxyRes.status >= 400) {
        console.error(`❌ Proxy returned error ${proxyRes.status}: ${proxyRes.data.toString().substring(0, 100)}`);
        
        if (proxyRes.status === 502 && proxyRes.data.toString().includes('connection_error')) {
            console.log(`\n⚠️ NOTE: This 502 is likely due to Clever Cloud (our remote fallback) failing because it hasn't been updated with our proxy fixes yet, OR due to Charter ISP blocking the domain locally.`);
        }
        continue;
      }

      if (!isM3u8) {
        console.log(`✅ Successfully proxied MP4 chunk. Content-Type: ${proxyRes.headers['content-type']}, Size: ${proxyRes.data.length} bytes`);
        successCount++;
        continue;
      }

      // 3. For m3u8, parse the manifest and fetch a video segment
      const manifest = proxyRes.data.toString();
      console.log(`✅ Successfully fetched manifest (${manifest.length} bytes)`);
      
      const lines = manifest.split('\n');
      let segmentUrl = null;
      
      // Look for a segment URI or another playlist URI
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('URI="')) {
            segmentUrl = lines[i].match(/URI="([^"]+)"/)[1];
            break;
        } else if (lines[i].trim() && !lines[i].startsWith('#')) {
            segmentUrl = lines[i].trim();
            break;
        }
      }

      if (!segmentUrl) {
        console.error(`❌ Could not find a segment in manifest.`);
        continue;
      }

      console.log(`🧩 Found segment URL: ${segmentUrl.substring(0, 60)}...`);
      const fullSegmentUrl = segmentUrl.startsWith('/') ? proxyBase + segmentUrl : segmentUrl;

      // 4. Fetch the segment through our local proxy
      console.log(`🔄 Fetching video segment through proxy...`);
      const segRes = await fetchProxy(fullSegmentUrl);

      if (segRes.status >= 400) {
        console.error(`❌ Segment fetch failed with ${segRes.status}: ${segRes.data.toString().substring(0, 100)}`);
        if (segRes.status === 502) {
             console.log(`\n⚠️ NOTE: Clever Cloud (our remote fallback) is likely returning 502 for this segment because it is running the OLD code which strictly blocks obfuscated image segments (like .png or .gif). Deployment to Clever Cloud is REQUIRED to fix this.`);
        }
        continue;
      }

      console.log(`✅ Successfully fetched segment. Content-Type: ${segRes.headers['content-type']}, Size: ${segRes.data.length} bytes`);
      successCount++;
      
    } catch (err) {
      console.error(`❌ Test threw exception: ${err.message}`);
    }
  }

  console.log(`\n--- TEST COMPLETE: ${successCount}/${ANIME_LIST.length} SUCCESSFUL ---`);
}

runTest();
