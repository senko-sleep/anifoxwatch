import { lookup } from 'dns/promises';

async function test() {
    const domains = [
        'rrr.web24code.site',
        'rrr.lab27core.site',
        'rrr.code29wave.site',
        'rrr.net22lab.site',
        'rrr.pro25zone.site',
        'rrr.tech20hub.site'
    ];
    for (const domain of domains) {
        try {
            const address = await lookup(domain);
            console.log(`DNS lookup for ${domain}: ${JSON.stringify(address)}`);
        } catch (err) {
            console.error(`DNS lookup for ${domain} failed: ${err.message}`);
        }
    }
}

test();
