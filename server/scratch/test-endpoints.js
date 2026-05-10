
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function test() {
    const baseUrl = 'http://localhost:3001';
    const endpoints = [
        { path: '/health', method: 'GET' },
        { path: '/api/sources/health/enhanced', method: 'GET' },
        { path: '/api/anime/trending?page=1', method: 'GET' },
        { path: '/api/anime/seasonal?page=1&year=2026&season=spring', method: 'GET' },
        { path: '/api/anime/browse?page=1&limit=24&status=upcoming&sort=popularity', method: 'GET' },
        { path: '/api/anime/hero-spotlight', method: 'GET' },
        { path: '/api/anime/latest?page=1', method: 'GET' },
        { 
            path: '/api/anilist/graphql', 
            method: 'POST', 
            body: { query: '{ Media(id: 154587) { title { romaji } } }' } 
        }
    ];

    for (const ep of endpoints) {
        try {
            console.log(`Testing ${ep.method} ${ep.path}...`);
            const options = {
                method: ep.method,
                headers: ep.method === 'POST' ? { 'Content-Type': 'application/json' } : {}
            };
            if (ep.body) options.body = JSON.stringify(ep.body);

            const res = await fetch(`${baseUrl}${ep.path}`, options);
            console.log(`Response: ${res.status} ${res.statusText}`);
            if (res.status !== 200) {
                const text = await res.text();
                console.log(`Error body: ${text.substring(0, 200)}`);
            }
        } catch (err) {
            console.log(`Failed to fetch ${ep.path}: ${err.message}`);
        }
    }
}

test();
