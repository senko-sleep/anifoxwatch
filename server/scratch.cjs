const axios = require('axios');
async function test() {
    try {
        const query = '{episode(showId:"2P7kFgthrEfRRkcdm",translationType:dub,episodeString:"1"){sourceUrls}}';
        const res = await axios.post('https://api.allanime.day/api', {query}, {headers: {'Referer': 'https://allmanga.to'}});
        console.log(JSON.stringify(res.data, null, 2));
    } catch(e) { console.error(e.message); }
}
test();
