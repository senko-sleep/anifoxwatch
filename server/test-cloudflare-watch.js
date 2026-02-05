/**
 * Test watch endpoint on Cloudflare Workers
 * Tests getting streaming links for an episode
 */

const BASE_URL = 'https://anifoxwatch-api.anifoxwatch.workers.dev';

async function testWatch() {
  console.log('🧪 Testing GET /api/stream/watch/:episodeId...\n');

  // Test with a real episode ID from HiAnime
  const episodeId = 'steinsgate-3?ep=230';
  const servers = ['hd-2', 'hd-1'];

  for (const server of servers) {
    console.log(`\n📡 Testing server: ${server}`);
    console.log('─'.repeat(50));

    const watchUrl = `${BASE_URL}/api/stream/watch/${encodeURIComponent(episodeId)}?server=${server}&category=sub`;

    try {
      const response = await fetch(watchUrl);
      
      console.log('Status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        
        console.log('Sources found:', data.sources?.length || 0);
        console.log('Subtitles found:', data.subtitles?.length || 0);
        console.log('Server used:', data.server);
        
        if (data.sources && data.sources.length > 0) {
          console.log('\n📺 Sources:');
          data.sources.forEach((source, i) => {
            console.log(`  ${i + 1}. Quality: ${source.quality}`);
            console.log(`     URL length: ${source.url?.length || 0}`);
            console.log(`     Is M3U8: ${source.isM3U8}`);
            console.log(`     URL preview: ${source.url?.substring(0, 100)}...`);
          });
          
          console.log(`\n✅ Watch endpoint works for ${server}!`);
        } else {
          console.log(`\n⚠️  No sources found for ${server}`);
        }
      } else {
        const errorText = await response.text();
        console.log('Error:', errorText);
        console.log(`\n❌ Watch endpoint failed for ${server}`);
      }
    } catch (error) {
      console.error(`❌ Error testing ${server}:`, error.message);
    }
  }
}

testWatch();
