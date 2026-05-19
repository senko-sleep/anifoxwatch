import axios from 'axios';

async function run() {
    console.log("Testing Watch API on Clever Cloud for Re:Zero Season 3 Episode 1 (with title parameter):");
    const testUrl = "https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io/api/stream/watch/anilist-189046?ep=1&title=Re%3AZERO%20-Starting%20Life%20in%20Another%20World-%20Season%203";
    console.log(`URL: ${testUrl}`);
    try {
        const res = await axios.get(testUrl);
        console.log("Status:", res.status);
        console.log("Response Data:");
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e: any) {
        console.error("Error:", e.message);
        if (e.response) {
            console.error("Response data:", e.response.data);
        }
    }
}

run();
