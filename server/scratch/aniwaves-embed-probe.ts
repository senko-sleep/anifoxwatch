import { AniwavesSource } from '../src/sources/aniwaves-source.js';
import { writeFileSync } from 'node:fs';

const src: any = new AniwavesSource();
const ep = process.argv[2] ?? 'aniwaves-82704&eps=1';
const servers = await src.getEpisodeServers(ep);
console.log(JSON.stringify(servers.map((s: any) => [s.name, s.type, s.url?.slice(0, 40)])));
for (const s of servers) {
    const r = await src.fetchWithProxyFallback('/ajax/sources', { params: { id: s.url } });
    const embed = r.data?.result?.url;
    console.log(s.name, s.type, embed);
    if (!embed) continue;
    const page = await fetch(embed, { headers: { Referer: 'https://aniwaves.ru/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36' } });
    const html = await page.text();
    writeFileSync(`../.artifacts/embed-${s.name}-${s.type}.html`, html);
    console.log('  ', page.status, html.length, page.url);
}
process.exit(0);
