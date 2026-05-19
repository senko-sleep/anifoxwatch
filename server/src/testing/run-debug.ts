import axios from 'axios';

async function main() {
    const res = await axios.get('https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io/api/stream/debug/test-sources');
    console.log(JSON.stringify(res.data, null, 2));
}

main().catch(console.error);
