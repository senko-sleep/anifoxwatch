/** Run: npx tsx testing/integration-gogo-direct.ts */
import { GogoanimeSource } from '../src/sources/gogoanime-source.js';

async function main() {
    const s = new GogoanimeSource();
    const id = process.argv[2] || 'gogoanime-one-piece-episode-1';
    const d = await s.getStreamingLinks(id, undefined, 'sub');
    console.log('sources', d.sources?.length, d.sources?.[0]?.url?.slice(0, 120));
    process.exit(d.sources?.length ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
