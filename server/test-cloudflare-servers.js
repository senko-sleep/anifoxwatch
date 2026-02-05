/**
 * Test episode servers endpoint on Cloudflare Workers
 * Tests getting available servers for an episode
 */

const BASE_URL = 'https://anifoxwatch-api.anifoxwatch.workers.dev';

async function testServers() {
  console.log('🧪 Testing GET /api/stream/servers/:episodeId...\n');

  // Test with a real episode ID from HiAnime
  const episodeId = 'steinsgate-3?ep=230';
  const serversUrl = `${BASE_URL}/api/stream/servers/${encodeURIComponent(episodeId)}`;

  try {
    console.log('Fetching servers for:', episodeId);
    console.log('URL:', serversUrl);
    console.log('─'.repeat(50));

    const response = await fetch(serversUrl);
    
    console.log('Status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      
      console.log('\n📡 Servers found:', data.servers?.length || 0);
      
      if (data.servers && data.servers.length > 0) {
        console.log('\nAvailable servers:');
        data.servers.forEach((server, i) => {
          console.log(`  ${i + 1}. ${server.name} (${server.type})`);
        });
        
        console.log('\n✅ Servers endpoint works!');
      } else {
        console.log('\n⚠️  No servers found');
      }
    } else {
      const errorText = await response.text();
      console.log('Error:', errorText);
      console.log('\n❌ Servers endpoint failed');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testServers();
