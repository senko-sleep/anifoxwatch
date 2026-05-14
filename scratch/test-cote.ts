import { resolveStream } from '../src/resolvers/SourceManager';
import { extractGogoAnimeStreamingLinks } from '../src/resolvers/gogoanime';
import { extractAniwavesStream } from '../src/resolvers/aniwaves';

async function testCOTE() {
    console.log("Testing gogoanime-classroom-of-the-elite-iv ep 1 SUB");
    try {
        const result = await resolveStream('gogoanime-classroom-of-the-elite-iv', 1, 'sub');
        console.log("SUB Success:", result ? "yes" : "no");
        if (result) console.log(result.source);
    } catch (e) {
        console.log("SUB Error:", e.message);
    }

    console.log("\nTesting gogoanime-classroom-of-the-elite-iv ep 1 DUB");
    try {
        const result = await resolveStream('gogoanime-classroom-of-the-elite-iv', 1, 'dub');
        console.log("DUB Success:", result ? "yes" : "no");
        if (result) console.log(result.source);
    } catch (e) {
        console.log("DUB Error:", e.message);
    }

    // try direct gogoanime extraction
    console.log("\nDirect Gogoanime SUB:");
    try {
        const result = await extractGogoAnimeStreamingLinks('classroom-of-the-elite-iv', 1);
        console.log("Direct Gogo SUB Success:", result ? "yes" : "no");
    } catch (e) {
        console.log("Direct Gogo SUB Error:", e.message);
    }

    console.log("\nDirect Gogoanime DUB:");
    try {
        const result = await extractGogoAnimeStreamingLinks('classroom-of-the-elite-iv-dub', 1);
        console.log("Direct Gogo DUB Success:", result ? "yes" : "no");
    } catch (e) {
        console.log("Direct Gogo DUB Error:", e.message);
    }
}

testCOTE();
