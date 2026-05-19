import dns from 'dns/promises';

dns.setServers(['8.8.8.8', '1.1.1.1']);

async function testDns() {
    const domains = [
        'rrr.dev23app.site',
        'dev23app.site',
    ];
    for (const d of domains) {
        try {
            const res = await dns.resolve(d);
            console.log(`✅ ${d}: ${res.join(', ')}`);
        } catch (e: any) {
            console.log(`❌ ${d}: ${e.code}`);
        }
    }
}
testDns();
