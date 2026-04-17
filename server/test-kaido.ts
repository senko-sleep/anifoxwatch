import axios from 'axios';

async function test() {
    console.log('Testing Kaido...');
    
    try {
        const r = await axios.get('https://kaido.to/search?keyword=naruto', {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        console.log('Status:', r.status);
        console.log('Data length:', r.data?.length);
    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

test();
