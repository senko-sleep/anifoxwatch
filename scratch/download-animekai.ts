import axios from 'axios';
import * as fs from 'fs';

async function run() {
    const watchUrl = 'https://animekai.to/watch/rezero-kara-hajimeru-isekai-seikatsu-4th-season-8lj0$ep=1$token=Ltfh8KXzuwau03VfhY-G';
    try {
        const resp = await axios.get(watchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            },
        });
        fs.writeFileSync('scratch/animekai-watch.html', resp.data);
        console.log("Saved scratch/animekai-watch.html!");
    } catch (e: any) {
        console.error(e.message);
    }
}

run();
