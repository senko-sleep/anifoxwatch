import axios from 'axios';

const domains = [
    'https://anitaku.to',
    'https://anitaku.pe',
    'https://gogoanimehd.to',
    'https://gogoanimes.fi',
    'https://gogoanime3.co',
    'https://gogoanime.la',
    'https://gogoanime.ar',
    'https://gogoanime.hu'
];

async function run() {
    for (const d of domains) {
        try {
            console.log(`Testing ${d}...`);
            const res = await axios.get(`${d}/search.html?keyword=naruto`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 5000
            });
            console.log(`  -> SUCCESS! Status: ${res.status}, length: ${res.data?.length || 0}`);
            if (res.data?.includes('last_episodes')) {
                console.log(`  -> Verified working Gogoanime mirror!`);
            }
        } catch (e: any) {
            console.log(`  -> FAILED: ${e.message}`);
        }
    }
}

run();
