import axios from 'axios';

async function run() {
    const anilistId = 189046;
    const query = `query($id:Int){Media(id:$id,type:ANIME){title{romaji english}}}`;
    try {
        const res = await axios.post('https://graphql.anilist.co', 
            { query, variables: { id: anilistId } },
            { 
                timeout: 5000, 
                headers: { 
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Origin': 'https://anilist.co',
                    'Referer': 'https://anilist.co/'
                } 
            }
        );
        console.log("AniList response:", JSON.stringify(res.data, null, 2));
    } catch (e: any) {
        console.error("Error query AniList:", e.message);
        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Data:", e.response.data);
        }
    }
}

run();
