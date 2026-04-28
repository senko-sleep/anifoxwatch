import axios from 'axios';

async function main() {
    // Try vibeplayer embed
    const embedUrl = 'https://vibeplayer.site/aac165bfc862642b';
    console.log('Fetching vibeplayer embed:', embedUrl);
    
    const r = await axios.get(embedUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://anitaku.to/',
        },
        timeout: 10000,
    });
    const html: string = r.data;
    console.log('Response length:', html.length);
    
    // Look for m3u8
    const m3u8s = [...html.matchAll(/["']([^"']*\.m3u8[^"']*?)["']/g)].map(m => m[1]);
    console.log('m3u8 URLs:', m3u8s.length);
    for (const u of m3u8s) console.log('  ', u.slice(0, 150));
    
    // Look for data-value (encrypted)
    const dataValue = html.match(/data-value="([^"]+)"/);
    if (dataValue) console.log('\nFound data-value (encrypted):', dataValue[1].slice(0, 60) + '...');
    
    // Look for encrypt-ajax
    if (html.includes('encrypt-ajax')) console.log('Found encrypt-ajax reference');
    
    // Look for any interesting URLs
    const urls = [...html.matchAll(/https?:\/\/[^\s"'<>]+/g)].map(m => m[0]);
    const interesting = urls.filter(u => u.includes('m3u8') || u.includes('mp4') || u.includes('ajax') || u.includes('encrypt'));
    console.log('\nInteresting URLs:', interesting.length);
    for (const u of interesting) console.log('  ', u.slice(0, 150));
    
    // Look for script sources
    const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*>/g)].map(m => m[1]);
    console.log('\nScript sources:', scripts.length);
    for (const s of scripts) console.log('  ', s.slice(0, 120));

    // Look for crypto patterns
    const cryptoPatterns = ['CryptoJS', 'aes', 'encrypt', 'decrypt', 'data-value', 'keys', 'iv '];
    for (const p of cryptoPatterns) {
        if (html.toLowerCase().includes(p.toLowerCase())) {
            console.log(`Found pattern: "${p}"`);
        }
    }

    // Dump first 2000 chars for inspection
    console.log('\n--- First 2000 chars ---');
    console.log(html.slice(0, 2000));
    
    process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
