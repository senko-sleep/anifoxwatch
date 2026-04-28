import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

async function run() {
  const jsResp = await axios.get('https://megaup.nl/assets/t1/embed/scripts-CqzZNxH5.js', {
    headers: { 'User-Agent': UA }
  });
  const js = jsResp.data as string;
  
  // Look for WebCrypto usage (importKey, decrypt, deriveKey, etc.)
  const cryptoPatterns = ['importKey', 'deriveKey', 'deriveBits', 'decrypt', 'encrypt', 'subtle', 'PBKDF2', 'HKDF', 'AES-GCM', 'AES-CBC'];
  for (const pat of cryptoPatterns) {
    const idx = js.indexOf(pat);
    if (idx >= 0) {
      console.log(`\n=== "${pat}" @${idx} ===`);
      console.log(js.substring(Math.max(0, idx - 150), idx + 400));
    }
  }
  
  // Also look for fetch('/media/')
  const mediaIdx = js.indexOf('/media/');
  if (mediaIdx >= 0) {
    console.log('\n=== /media/ fetch ===');
    console.log(js.substring(Math.max(0, mediaIdx - 200), mediaIdx + 500));
  }
  
  // Look for __PAGE_DATA
  const pdIdx = js.indexOf('PAGE_DATA');
  if (pdIdx >= 0) {
    console.log('\n=== __PAGE_DATA usage ===');
    console.log(js.substring(Math.max(0, pdIdx - 50), pdIdx + 400));
  }
}
run().catch((e: any) => console.error(e.message));
