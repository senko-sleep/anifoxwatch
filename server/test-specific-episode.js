/**
 * Test the specific episode that's failing
 */

const BASE_URL = 'https://anifoxwatch-api.anifoxwatch.workers.dev';

async function testSpecificEpisode() {
  console.log('🧪 Testing specific episode: jujutsu-kaisen-the-culling-game-part-1-20401?ep=162345\n');

  const episodeId = 'jujutsu-kaisen-the-culling-game-part-1-20401?ep=162345';
  
  // Test 1: Get servers
  console.log('📡 Step 1: Getting servers...');
  try {
    const serversUrl = `${BASE_URL}/api/stream/servers/${encodeURIComponent(episodeId)}`;
    console.log('URL:', serversUrl);
    
    const serversRes = await fetch(serversUrl);
    console.log('Status:', serversRes.status);
    
    const serversData = await serversRes.json();
    console.log('Servers:', JSON.stringify(serversData, null, 2));
  } catch (error) {
    console.error('❌ Servers error:', error.message);
  }

  // Test 2: Get streaming links with hd-2 dub
  console.log('\n📺 Step 2: Getting streaming links (hd-2, dub)...');
  try {
    const watchUrl = `${BASE_URL}/api/stream/watch/${encodeURIComponent(episodeId)}?server=hd-2&category=dub`;
    console.log('URL:', watchUrl);
    
    const watchRes = await fetch(watchUrl);
    console.log('Status:', watchRes.status);
    
    const watchData = await watchRes.json();
    console.log('Response:', JSON.stringify(watchData, null, 2));
    
    if (watchData.sources && watchData.sources.length > 0) {
      console.log('\n✅ Found sources!');
    } else {
      console.log('\n❌ No sources found');
      console.log('Error:', watchData.error);
      console.log('Suggestion:', watchData.suggestion);
    }
  } catch (error) {
    console.error('❌ Watch error:', error.message);
  }

  // Test 3: Try different servers
  console.log('\n📺 Step 3: Trying all servers...');
  const servers = ['hd-2', 'hd-1', 'hd-3'];
  
  for (const server of servers) {
    console.log(`\nTrying ${server}...`);
    try {
      const watchUrl = `${BASE_URL}/api/stream/watch/${encodeURIComponent(episodeId)}?server=${server}&category=dub`;
      const watchRes = await fetch(watchUrl);
      const watchData = await watchRes.json();
      
      console.log(`  Sources: ${watchData.sources?.length || 0}`);
      console.log(`  Server used: ${watchData.server}`);
      
      if (watchData.error) {
        console.log(`  Error: ${watchData.error}`);
      }
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
    }
  }
}

testSpecificEpisode();
