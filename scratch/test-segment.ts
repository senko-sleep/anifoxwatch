import axios from 'axios';
import https from 'https';

const url = 'https://hlsx3cdn.burntburst45.store/koe-no-katachi-movie/1/720/0000.ts';
const referer = 'https://aniwaves.ru';

async function test() {
    try {
        console.log(`Testing segment: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'Referer': referer,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false,
                ciphers: 'DEFAULT:@SECLEVEL=0'
            }),
            timeout: 10000
        });
        console.log(`Success! Status: ${response.status}`);
        console.log(`Content-Type: ${response.headers['content-type']}`);
        console.log(`Content-Length: ${response.headers['content-length']}`);
    } catch (error: any) {
        console.error(`Failed! Status: ${error.response?.status}`);
        console.error(`Message: ${error.message}`);
        if (error.response?.data) {
            console.error(`Data: ${JSON.stringify(error.response.data)}`);
        }
    }
}

test();
