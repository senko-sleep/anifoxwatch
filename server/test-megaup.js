import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

// The megaup URL from the iframe
const megaupEmbedUrl = 'https://megaup.nl/e/0MXhJz6-WS2JcOLyFrNO7RvpCQ?';
const megaupMediaUrl = megaupEmbedUrl.replace('/e/', '/media/');

async function testMegaup() {
    console.log('Embed URL:', megaupEmbedUrl);
    console.log('Media URL:', megaupMediaUrl);
    
    // Test 1: Direct fetch to /media/
    console.log('\n=== 1. Direct /media/ fetch ===');
    try {
        const resp = await axios.get(megaupMediaUrl, {
            headers: {
                'User-Agent': UA,
                'Referer': megaupEmbedUrl,
                'X-Requested-With': 'XMLHttpRequest',
            },
            timeout: 15000,
        });
        console.log('Status:', resp.status);
        console.log('Data:', JSON.stringify(resp.data)?.substring(0, 300));
        
        if (resp.data?.result) {
            console.log('\n✓ Got encrypted text, length:', resp.data.result.length);
        }
    } catch (err) {
        console.log('Error:', err.message);
        if (err.response) {
            console.log('Status:', err.response.status);
            console.log('Data:', err.response.data?.substring(0, 200));
        }
    }
    
    // Test 2: Via proxy
    console.log('\n=== 2. Via proxy ===');
    const proxyUrl = `https://anifoxwatch.vercel.app/api/stream/proxy?url=${encodeURIComponent(megaupMediaUrl)}&referer=${encodeURIComponent(megaupEmbedUrl)}`;
    console.log('Proxy URL:', proxyUrl.substring(0, 100) + '...');
    try {
        const resp = await axios.get(proxyUrl, { timeout: 20000 });
        console.log('Status:', resp.status);
        console.log('Data:', JSON.stringify(resp.data)?.substring(0, 300));
    } catch (err) {
        console.log('Error:', err.message);
        if (err.response) {
            console.log('Proxy status:', err.response.status);
        }
    }
}

testMegaup();
