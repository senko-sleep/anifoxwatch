import { SourceManager } from '../services/source-manager.js';

async function main() {
    const sm = new SourceManager();
    const gogo = sm['sources'].get('Gogoanime');
    const allanime = sm['sources'].get('AllAnime');
    
    if (gogo) {
        console.log('--- Gogoanime search ---');
        const res = await gogo.search('Re:Zero', 1);
        console.log(res.results.map(r => ({ id: r.id, title: r.title })));
    }
    if (allanime) {
        console.log('--- AllAnime search ---');
        const res = await allanime.search('Re:Zero', 1);
        console.log(res.results.map(r => ({ id: r.id, title: r.title })));
    }
}

main().catch(console.error);
