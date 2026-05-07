import { GogoanimeSource } from './server/src/sources/gogoanime-source.js';

async function main() {
    const gogo = new GogoanimeSource();
    const gogoRes = await gogo.search('Baka to Test to Shoukanjuu');
    console.log(gogoRes.results.map(r => r.id + ' | ' + r.title));
}
main();
