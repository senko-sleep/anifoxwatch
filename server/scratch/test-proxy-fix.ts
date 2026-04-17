
import axios from 'axios';
import https from 'https';

const proxyBase = 'http://localhost:3001/api/stream/proxy';
const targetUrl = 'https://rrr.tech20hub.site/pz78/c5/h50df5af22'; // Simplified for test

async function testProxy() {
  console.log(`Testing proxy for: ${targetUrl}`);
  
  // We'll mimic the proxy logic directly to see what the upstream returns
  const refererCombos = [
    { referer: 'https://megaup.nl/', origin: 'https://megaup.nl' },
    { referer: 'https://aniwatchtv.to/', origin: 'https://aniwatchtv.to' }
  ];

  for (const combo of refererCombos) {
    try {
      console.log(`Trying referer: ${combo.referer}`);
      const resp = await axios.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Referer': combo.referer,
          'Origin': combo.origin
        },
        timeout: 5000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }) // Relaxed as per my previous fix
      });
      console.log(`SUCCESS! Status: ${resp.status}`);
      return;
    } catch (err) {
      console.log(`FAILED with ${combo.referer}: ${err.message}`);
    }
  }
}

testProxy();
