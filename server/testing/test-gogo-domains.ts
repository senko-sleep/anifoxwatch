import axios from 'axios';

const domains = [
    'https://anitaku.pe',
    'https://anitaku.so', 
    'https://anitaku.to',
    'https://gogoanime3.co',
    'https://gogoanime3.cc',
    'https://gogoanimehd.to',
    'https://gogoanimes.fi',
    'https://gogoanime.run',
    'https://gogoanime.tel',
    'https://gogoanime.ar',
    'https://gogoanime.cl',
    'https://gogoanime.sk',
    'https://anitaku.bz',
    'https://anitaku.io',
];

async function main() {
    console.log('Testing Gogoanime domains...\n');
    for (const domain of domains) {
        try {
            const r = await axios.get(`${domain}/search.html?keyword=naruto`, {
                timeout: 8000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                maxRedirects: 3,
                validateStatus: () => true,
            });
            const hasResults = r.data?.includes?.('last_episodes') || r.data?.includes?.('items');
            console.log(`${hasResults ? '✅' : '⚠️'} ${domain} → ${r.status} (search results: ${hasResults})`);
            if (r.status >= 300 && r.status < 400) {
                console.log(`   Redirect: ${r.headers.location}`);
            }
        } catch (e: any) {
            console.log(`❌ ${domain} → ${e.code || e.message?.slice(0, 60)}`);
        }
    }
    process.exit(0);
}
main();
