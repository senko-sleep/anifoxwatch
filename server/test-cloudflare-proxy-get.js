/**
 * Test GET proxy endpoint on Cloudflare Workers
 * Tests short URLs via GET method
 */

const BASE_URL = 'https://anifoxwatch-api.anifoxwatch.workers.dev';

async function testProxyGet() {
  console.log('🧪 Testing GET /api/stream/proxy with short URL...\n');

  const testUrl = 'https://dl.netmagcdn.com/test.m3u8';
  const proxyUrl = `${BASE_URL}/api/stream/proxy?url=${encodeURIComponent(testUrl)}`;

  try {
    const response = await fetch(proxyUrl);
    
    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const text = await response.text();
      console.log('Response length:', text.length);
      console.log('First 200 chars:', text.substring(0, 200));
      console.log('\n✅ GET proxy test passed');
    } else {
      console.log('Response:', await response.text());
      console.log('\n❌ GET proxy test failed');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testProxyGet();
