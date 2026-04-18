import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

const targetUrl = 'https://rrr.shop21pro.site/pp36/c5/h50df5af2216e63e526ab13c2edf9bf365ba5dcdb6d40253103707292ddccf72d090311889506f11b2f80b30ad5265a2d6ecc493aad84d503ef1ed5d25e35f7c9/list,EJYZr3MzbO03rB6B8-LjdB6_ivN2Qw.m3u8';

async function testProxy() {
  const refererCombos = [
    { referer: 'https://megaup.nl/e/0cv1eGXxWS2JcOLyF75N5hfpCQ', origin: 'https://megaup.nl' },
  ];

  for (const combo of refererCombos) {
    try {
      console.log(`Trying referer: ${combo.referer}`);
      const headers = { 'Referer': combo.referer, 'Origin': combo.origin };
      
      const makeProxyRequest = (protocol: string, relaxed: boolean) => {
         const url = protocol === 'http' ? targetUrl.replace(/^https:\/\//i, 'http://') : targetUrl;
         const httpsAgent = new https.Agent({
             rejectUnauthorized: false,
             secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
             ciphers: 'DEFAULT:@SECLEVEL=0'
         });
         return axios.get(url, {
             headers, timeout: 10000, responseType: 'text',
             httpsAgent
         });
      };

      let response: any;
      try {
          response = await makeProxyRequest('https', false);
          console.log(`Initial proxy success: ${response.status}`);
      } catch (err: any) {
          const errMsg = err.message || '';
          if (errMsg.includes('EPROTO') || err.code === 'EPROTO' || errMsg.includes('wrong version number')) {
              try {
                  response = await makeProxyRequest('https', true);
              } catch(tlsErr: any) {
                  response = await makeProxyRequest('http', false);
                  console.log(`HTTP fallback HTML snippet:`, String(response.data).substring(0, 500));
              }
          } else {
              console.log(`Other error: ${errMsg}`);
          }
      }
      
      console.log(`FINAL SUCCESS! Status: ${response?.status}`);
      return;
    } catch (err: any) {
      console.log(`FAILED with ${combo.referer}: ${err.message}`);
    }
  }
}

testProxy();
