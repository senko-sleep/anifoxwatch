// Test multiple Consumet API instances to find a working one
async function testConsumet(url: string) {
    try {
        const r = await fetch(`${url}/anime/gogoanime/spy x family`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return { url, status: r.status, error: 'non-200' };
        const d = await r.json() as { results?: any[] };
        return { url, status: r.status, results: d.results?.length ?? 0 };
    } catch (e: any) {
        return { url, error: e.message };
    }
}

const instances = [
    'https://api.consumet.org',
    'https://consumet-api-six.vercel.app',
    'https://consumet.techbits.cloud',
    'https://api.anify.tv',
    'https://consumet-eight.vercel.app',
    'https://api-consumet.vercel.app',
    'https://consumet.api.hsaka.moe',
    'https://consumet.hsaka.moe',
];

console.log('Testing Consumet instances...\n');
const results = await Promise.allSettled(instances.map(testConsumet));
results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
        console.log(JSON.stringify(r.value));
    } else {
        console.log(`${instances[i]}: FAILED`);
    }
});
