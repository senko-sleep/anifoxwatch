
import axios from 'axios';

async function testProxy() {
  const targetUrl = 'https://hlsx5cdn.burntburst45.store/baka-to-test-to-shoukanjuu-ni-dub/4/master.m3u8';
  const proxyUrl = 'http://127.0.0.1:3001/api/stream/proxy?url=' + encodeURIComponent(targetUrl) + '&referer=' + encodeURIComponent('https://aniwaves.ru');
  
  console.log(`Testing proxy for: ${targetUrl}`);
  console.log(`Proxy URL: ${proxyUrl}`);
  
  try {
    const start = Date.now();
    const resp = await axios.get(proxyUrl, { timeout: 30000 });
    const duration = Date.now() - start;
    
    console.log(`Status: ${resp.status}`);
    console.log(`Content-Type: ${resp.headers['content-type']}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Content snippet: ${resp.data.substring(0, 200)}`);
    
    if (resp.data.includes('localhost:3001') || resp.data.includes('127.0.0.1:3001')) {
      console.log('✅ Success: Manifest rewritten to local proxy');
    } else if (resp.data.includes('vercel.app')) {
      console.log('❌ Failure: Manifest rewritten to Vercel (remote fallback happened)');
    } else {
      console.log('❓ Unknown: Manifest content not rewritten as expected or not an m3u8');
    }
  } catch (err: any) {
    console.error(`❌ Proxy failed: ${err.message}`);
    if (err.response) {
      console.error(`Response status: ${err.response.status}`);
      console.error(`Response body: ${JSON.stringify(err.response.data)}`);
    }
  }
}

testProxy();
