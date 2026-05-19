import axios from 'axios';
import * as fs from 'fs';

async function run() {
    const embedUrl = 'https://megaplay.buzz/stream/s-2/128356/sub?autostart=true';
    try {
        const res = await axios.get(embedUrl, {
            headers: {
                'Referer': 'https://gogoanime.me.uk/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        fs.writeFileSync('scratch/megaplay.html', res.data);
        console.log("Saved scratch/megaplay.html!");
    } catch (e: any) {
        console.error(e.message);
    }
}

run();
