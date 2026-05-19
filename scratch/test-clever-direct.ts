import axios from 'axios';

async function run() {
    console.log("Testing direct Re:Zero Season 3 episode 1 watch endpoint on Clever Cloud:");
    try {
        const res = await axios.get('https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io/api/stream/watch/re-zero-starting-life-in-another-world-season-3-episode-1');
        console.log("Status:", res.status);
        console.log("Data:");
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e: any) {
        console.error("Error:", e.message);
        if (e.response) {
            console.error("Response data:", e.response.data);
        }
    }
}

run();
