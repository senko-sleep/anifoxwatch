
import axios from 'axios';
import https from 'node:https';

async function testAxios() {
  const url = 'https://hlsx5cdn.burntburst45.store/baka-to-test-to-shoukanjuu-ni-dub/4/master.m3u8';
  const referer = 'https://aniwaves.ru/';
  
  console.log(`Testing direct axios for: ${url}`);
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Referer': referer,
    'Accept': '*/*'
  };
  
  try {
    console.log('Attempting standard HTTPS...');
    const resp = await axios.get(url, { headers, timeout: 10000, responseType: 'stream' });
    console.log(`✅ Standard HTTPS Success: ${resp.status}`);
    // Drain stream to confirm
    let size = 0;
    for await (const chunk of resp.data) { size += chunk.length; }
    console.log(`Stream drained: ${size} bytes`);
  } catch (err: any) {
    console.log(`❌ Standard HTTPS Failed: ${err.message}`);
    
    console.log('Attempting relaxed TLS...');
    try {
      const agent = new https.Agent({ rejectUnauthorized: false, ciphers: 'DEFAULT:@SECLEVEL=0' });
      const resp = await axios.get(url, { headers, timeout: 10000, httpsAgent: agent });
      console.log(`✅ Relaxed TLS Success: ${resp.status}`);
    } catch (err2: any) {
      console.log(`❌ Relaxed TLS Failed: ${err2.message}`);
      
      console.log('Attempting HTTP fallback...');
      try {
        const httpUrl = url.replace(/^https:/i, 'http:');
        const resp = await axios.get(httpUrl, { headers, timeout: 10000 });
        console.log(`✅ HTTP Success: ${resp.status}`);
      } catch (err3: any) {
        console.log(`❌ HTTP Failed: ${err3.message}`);
      }
    }
  }
}

testAxios();
