import axios from 'axios';

async function test() {
    const url = 'https://rrr.megaup.cc/c6/h1ca5287751bdc312a5ca0c70e3955fb57d7fbaa16f876688879772de101e2b2c3d20a875cf0d45b4a84ed386bf9e23779a66bde7c9eb258d62244f18f02605b808cd894dc97b1197a07bfc9ee0/4/aGxzLzEwODAvMDAwMA.gif';
    const referer = 'https://animekai.to/';
    
    console.log(`Testing URL: ${url}`);
    
    try {
        const resp = await axios.get(url, {
            headers: {
                'Referer': referer,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        console.log(`Status: ${resp.status}`);
        console.log(`Content-Type: ${resp.headers['content-type']}`);
        console.log(`Size: ${resp.data.length} bytes`);
    } catch (err: any) {
        console.error(`Error: ${err.message}`);
        if (err.response) {
            console.error(`Response status: ${err.response.status}`);
            console.error(`Response data snippet: ${String(err.response.data).substring(0, 100)}`);
        }
    }
}

test();
