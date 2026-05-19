import axios from 'axios';

async function run() {
    console.log("Testing end-to-end local Express /api/stream/watch/gogoanime-re-zero-starting-life-in-another-world-season-3-episode-1");
    try {
        const res = await axios.get('http://localhost:3001/api/stream/watch/re-zero-starting-life-in-another-world-season-3-episode-1?server=Gogoanime');
        console.log("Status:", res.status);
        console.log("Data:");
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

run();
