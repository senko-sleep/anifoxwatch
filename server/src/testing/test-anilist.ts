import axios from 'axios';

async function main() {
    const query = `query($id:Int){Media(id:$id,type:ANIME){title{romaji english}}}`;
    const res = await axios.post(
        'https://graphql.anilist.co',
        { query, variables: { id: 189046 } },
        { timeout: 5000, headers: { 'Content-Type': 'application/json' } }
    );
    console.log(JSON.stringify(res.data?.data?.Media?.title, null, 2));
}

main().catch(console.error);
