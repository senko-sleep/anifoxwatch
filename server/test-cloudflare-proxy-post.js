/**
 * Test POST proxy endpoint on Cloudflare Workers
 * Tests long URLs via POST method (solves URL truncation issue)
 */

const BASE_URL = 'https://anifoxwatch-api.anifoxwatch.workers.dev';

async function testProxyPost() {
  console.log('🧪 Testing POST /api/stream/proxy with long URL...\n');

  // Simulate a very long HLS URL (like the ones from netmagcdn)
  const longUrl = 'https://dl.netmagcdn.com:2228/hls-playback/1045ce04cf93fecf1a122479cf6cc60a8a623f0f88ece419a1542ac6bd14900a487811db96433b34404f75ea74d12164c72da19bdc6a51e7c8aea7e5179bbac5302eca918a156e5c96b8ff7e07aa004d54cac1512b308a0184b0918afcd5a45b5a2e16f2683129db0c7c39f8d91a1b1fbc63c7d5eb3ab42b7ad883fcebb21299d1963c7a7b75cd01ab7a77a42a417dfbd10c5b308136fb96c9f5dc358bbdb6ae/master.m3u8';

  const proxyUrl = `${BASE_URL}/api/stream/proxy`;

  try {
    console.log('Sending POST request with URL in body...');
    console.log('URL length:', longUrl.length);
    
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: longUrl })
    });
    
    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const text = await response.text();
      console.log('Response length:', text.length);
      console.log('First 500 chars:', text.substring(0, 500));
      console.log('\n✅ POST proxy test passed - Long URLs work!');
    } else {
      const errorText = await response.text();
      console.log('Error response:', errorText);
      console.log('\n❌ POST proxy test failed');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testProxyPost();
