const http = require('http');

const animeList = [
  { id: 20958, name: "Demon Slayer" },
  { id: 16498, name: "Attack on Titan" },
  { id: 31964, name: "My Hero Academia" },
  { id: 11061, name: "Hunter x Hunter" },
  { id: 21, name: "One Piece" }
];

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
          resolve({ error: e.message });
        }
      });
    });

    req.on('error', (e) => resolve({ error: e.message }));
    req.end();
  });
}

async function testAnime(anime) {
  console.log(`\n========== ${anime.name} ==========`);
  
  const resolveData = await makeRequest(`/api/anime/resolve?id=anilist-${anime.id}`);
  if (!resolveData || !resolveData.streamingId) {
    console.log(`❌ Resolve failed`);
    return { name: anime.name, dub: false, error: 'resolve' };
  }
  console.log(`✅ Resolved`);

  const epData = await makeRequest(`/api/anime/episodes?id=${encodeURIComponent(resolveData.streamingId)}`);
  if (!epData || !epData.episodes || epData.episodes.length === 0) {
    console.log(`❌ No episodes`);
    return { name: anime.name, dub: false, error: 'episodes' };
  }
  const firstEp = epData.episodes[0];
  console.log(`✅ Episodes: ${epData.episodes.length}`);

  const streamData = await makeRequest(`/api/stream/watch/${encodeURIComponent(firstEp.id)}?category=dub&ep_num=1&anilist_id=${anime.id}`);

  if (streamData.error) {
    console.log(`❌ Stream error: ${streamData.error}`);
    return { name: anime.name, dub: false, error: streamData.error };
  }

  if (!streamData.sources || streamData.sources.length === 0) {
    console.log(`⚠️  No DUB (dubUnavailable: ${streamData.dubUnavailable})`);
    return { name: anime.name, dub: false, dubUnavailable: true };
  }

  const source = streamData.sources[0];
  console.log(`✅ DUB FOUND!`);
  console.log(`   Source: ${source.server || streamData.server}`);
  console.log(`   Quality: ${source.quality || 'unknown'}`);
  console.log(`   Category: ${streamData.category}`);
  console.log(`   URL: ${source.url?.substring(0, 50)}...`);

  return { name: anime.name, dub: true, server: source.server || streamData.server };
}

async function run() {
  console.log('Testing DUB streams on 5 anime...\n');
  
  const results = [];
  for (const anime of animeList) {
    const result = await testAnime(anime);
    results.push(result);
  }

  console.log('\n========== SUMMARY ==========');
  const dubs = results.filter(r => r.dub);
  const noDubs = results.filter(r => !r.dub && r.dubUnavailable);
  const errors = results.filter(r => !r.dub && !r.dubUnavailable);

  console.log(`✅ DUB Found: ${dubs.length}`);
  dubs.forEach(r => console.log(`   - ${r.name} (${r.server})`));
  console.log(`\n⚠️  No DUB: ${noDubs.length}`);
  noDubs.forEach(r => console.log(`   - ${r.name}`));
  console.log(`\n❌ Errors: ${errors.length}`);
  errors.forEach(r => console.log(`   - ${r.name} (${r.error})`));
}

run();
