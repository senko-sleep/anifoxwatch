
import axios from 'axios';
import https from 'https';

async function testProxyUrl() {
    const url = 'https://rrr.shop21pro.site/pp36/c5/h50df5af22';
    const referers = [
        'https://megaup.nl/',
        'https://watchhentai.net/',
        'https://aniwatchtv.to/'
    ];

    for (const referer of referers) {
        console.log(`Testing with Referer: ${referer}`);
        try {
            const res = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': referer,
                    'Origin': new URL(referer).origin
                },
                httpsAgent: new https.Agent({ rejectUnauthorized: false }),
                timeout: 5000
            });
            console.log(`Status: ${res.status}`);
            console.log(`Content-Type: ${res.headers['content-type']}`);
            console.log(`Content Sample (100 chars): ${res.data.substring(0, 100)}`);
        } catch (err: any) {
            console.log(`Failed: ${err.message}`);
            if (err.response) {
                console.log(`Status: ${err.response.status}`);
                console.log(`Data: ${JSON.stringify(err.response.data)}`);
            }
        }
        console.log('---');
    }
}

testProxyUrl();
