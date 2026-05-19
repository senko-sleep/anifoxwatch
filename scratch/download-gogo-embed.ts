import axios from 'axios';
import * as fs from 'fs';

async function run() {
    const embedUrl = 'https://gogoanime.me.uk/newplayer.php?id=rezero-starting-life-in-another-world-season-3-19301?ep=128356&type=hd-1&category=sub';
    try {
        const res = await axios.get(embedUrl, {
            headers: {
                'Referer': 'https://gogoanimes.fi/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        fs.writeFileSync('scratch/gogo-embed.html', res.data);
        console.log("Saved scratch/gogo-embed.html!");
    } catch (e: any) {
        console.error(e.message);
    }
}

run();
