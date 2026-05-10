import axios from 'axios';
import { lookup } from 'dns/promises';

async function test(domain: string) {
    console.log(`--- Testing ${domain} ---`);
    try {
        const address = await lookup(domain);
        console.log(`DNS lookup for ${domain}: ${JSON.stringify(address)}`);
    } catch (err) {
        console.error(`DNS lookup for ${domain} failed: ${err.message}`);
    }

    const url = `https://${domain}/`;
    try {
        const resp = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://megaup.nl/'
            },
            timeout: 5000
        });
        console.log(`GET ${url} status: ${resp.status}`);
    } catch (err) {
        console.error(`GET ${url} failed: ${err.message}`);
    }
}

async function run() {
    await test('rrr.megaup.cc');
    await test('rrr.megaup.nl');
    await test('rrr.megaup.live');
    await test('rrr.megaup.to');
}

run();
