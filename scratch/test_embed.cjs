const { streamExtractor } = require('./server/dist/services/stream-extractor.js');
async function test() {
    const url = 'https://gogoanime.me.uk/newplayer.php?id=boruto-naruto-next-generations-8143?ep=99728&type=hd-1&category=dub';
    const result = await streamExtractor.extractFromEmbed(url);
    console.log(JSON.stringify(result, null, 2));
    await streamExtractor.close();
}
test();
