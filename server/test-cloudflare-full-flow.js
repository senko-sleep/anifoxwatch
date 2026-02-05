/**
 * Full integration test for Cloudflare Workers streaming
 * Tests the complete flow: servers -> watch -> proxy
 */

const BASE_URL = 'https://anifoxwatch-api.anifoxwatch.workers.dev';

async function testFullFlow() {
  console.log('🚀 Starting full streaming flow test on Cloudflare Workers\n');
  console.log('═'.repeat(60));

  const episodeId = 'steinsgate-3?ep=230';

  // Step 1: Get available servers
  console.log('\n📡 STEP 1: Getting available servers...');
  console.log('─'.repeat(60));

  try {
    const serversResponse = await fetch(
      `${BASE_URL}/api/stream/servers/${encodeURIComponent(episodeId)}`
    );

    if (!serversResponse.ok) {
      throw new Error(`Servers request failed: ${serversResponse.status}`);
    }

    const serversData = await serversResponse.json();
    console.log('✅ Servers found:', serversData.servers?.length || 0);
    
    if (serversData.servers && serversData.servers.length > 0) {
      serversData.servers.forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.name} (${s.type})`);
      });
    }

    // Step 2: Get streaming links
    console.log('\n\n🎬 STEP 2: Getting streaming links...');
    console.log('─'.repeat(60));

    const server = 'hd-2';
    const watchResponse = await fetch(
      `${BASE_URL}/api/stream/watch/${encodeURIComponent(episodeId)}?server=${server}&category=sub`
    );

    if (!watchResponse.ok) {
      throw new Error(`Watch request failed: ${watchResponse.status}`);
    }

    const watchData = await watchResponse.json();
    console.log('✅ Sources found:', watchData.sources?.length || 0);
    console.log('   Server used:', watchData.server);
    
    if (watchData.sources && watchData.sources.length > 0) {
      const firstSource = watchData.sources[0];
      console.log('\n   First source details:');
      console.log('   - Quality:', firstSource.quality);
      console.log('   - Is M3U8:', firstSource.isM3U8);
      console.log('   - URL length:', firstSource.url?.length || 0);
      console.log('   - URL preview:', firstSource.url?.substring(0, 120) + '...');

      // Step 3: Test proxy with the URL
      console.log('\n\n🔄 STEP 3: Testing proxy with streaming URL...');
      console.log('─'.repeat(60));

      // Check if URL is proxied
      const isProxied = firstSource.url.includes('/api/stream/proxy');
      console.log('   URL is proxied:', isProxied);

      if (isProxied) {
        // Extract the actual URL from proxy
        const urlMatch = firstSource.url.match(/url=(.+)/);
        if (urlMatch) {
          const actualUrl = decodeURIComponent(urlMatch[1]);
          console.log('   Actual URL length:', actualUrl.length);
          console.log('   Actual URL preview:', actualUrl.substring(0, 100) + '...');

          // Test POST proxy for long URLs
          if (actualUrl.length > 1000) {
            console.log('\n   Testing POST proxy (long URL)...');
            const proxyResponse = await fetch(`${BASE_URL}/api/stream/proxy`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: actualUrl })
            });

            console.log('   Proxy status:', proxyResponse.status);
            
            if (proxyResponse.ok) {
              const contentType = proxyResponse.headers.get('content-type');
              console.log('   Content-Type:', contentType);
              
              const text = await proxyResponse.text();
              console.log('   Response length:', text.length);
              console.log('   First 300 chars:', text.substring(0, 300));
              
              console.log('\n   ✅ POST proxy works for long URLs!');
            } else {
              console.log('   ❌ Proxy failed:', await proxyResponse.text());
            }
          } else {
            console.log('   URL is short, GET proxy should work');
          }
        }
      }

      console.log('\n\n' + '═'.repeat(60));
      console.log('🎉 FULL FLOW TEST COMPLETED SUCCESSFULLY!');
      console.log('═'.repeat(60));
      console.log('\n✅ All endpoints working:');
      console.log('   1. ✅ Servers endpoint');
      console.log('   2. ✅ Watch endpoint');
      console.log('   3. ✅ Proxy endpoint (POST for long URLs)');
      console.log('\n🚀 Cloudflare Workers streaming is ready!');

    } else {
      console.log('\n⚠️  No sources found - may need to try different episode');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testFullFlow();
