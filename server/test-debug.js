import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

async function test() {
    const megaupEmbedUrl = 'https://megaup.nl/e/0MXhJz6-WS2JcOLyFrNO7RvpCQ?';
    const mediaUrl = megaupEmbedUrl.replace('/e/', '/media/');
    
    console.log('Fetching:', mediaUrl);
    const resp = await axios.get(mediaUrl, {
        headers: {
            'User-Agent': UA,
            'Referer': megaupEmbedUrl,
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': '*/*',
        },
        timeout: 15000,
    });
    
    console.log('Status:', resp.status);
    console.log('Headers:', JSON.stringify(resp.headers, null, 2)?.substring(0, 200));
    console.log('\nData type:', typeof resp.data);
    console.log('Data:', JSON.stringify(resp.data)?.substring(0, 500));
}

test().catch(console.error);
