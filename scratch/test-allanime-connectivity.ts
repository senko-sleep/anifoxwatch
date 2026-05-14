import axios from 'axios';

async function testAllAnimeDomains() {
    const domains = [
        'https://api.allanime.day/api',
        'https://allanime.day/api',
        'https://api.allanime.to/api',
        'https://api.allanime.ai/api',
        'https://allmanga.to/api'
    ];
    
    const query = `{shows(search:{query:"Naruto"},limit:1,page:1,countryOrigin:ALL){edges{_id,name}}}`;
    
    for (const url of domains) {
        console.log(`\nTesting: ${url}`);
        try {
            const resp = await axios.post(url, { query }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
                    'Referer': 'https://allmanga.to/',
                },
                timeout: 5000
            });
            console.log(`Status: ${resp.status}`);
            console.log(`Data: ${JSON.stringify(resp.data).substring(0, 200)}...`);
        } catch (e: any) {
            console.log(`Error: ${e.message}`);
            if (e.response) {
                console.log(`Response Status: ${e.response.status}`);
                console.log(`Response Data: ${JSON.stringify(e.response.data).substring(0, 200)}...`);
            }
        }
    }
}

testAllAnimeDomains();
