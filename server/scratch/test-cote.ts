import { SourceManager } from '../src/services/source-manager.js';
import { GogoanimeSource } from '../src/sources/gogoanime-source.js';

async function testCOTE() {
    const manager = new SourceManager();
    const gogo = new GogoanimeSource();

    console.log("Testing gogoanime-classroom-of-the-elite-iv ep 1 SUB via source");
    try {
        const stream = await gogo.getStreamingLinks('classroom-of-the-elite-iv', '1', 'sub');
        console.log("SUB Success:", stream ? "yes" : "no");
        if (stream && stream.sources) {
            console.log(stream.sources[0]);
        }
    } catch (e: any) {
        console.log("SUB Error:", e.message);
    }

    console.log("\nTesting gogoanime-classroom-of-the-elite-iv ep 1 DUB via source");
    try {
        // usually dub IDs have -dub suffix
        const stream = await gogo.getStreamingLinks('classroom-of-the-elite-iv-dub', '1', 'dub');
        console.log("DUB Success:", stream ? "yes" : "no");
        if (stream && stream.sources) {
            console.log(stream.sources[0]);
        }
    } catch (e: any) {
        console.log("DUB Error:", e.message);
    }
    
    console.log("\nTesting SourceManager resolveStream DUB...");
    try {
        const result = await manager.getStreamingLinks('gogoanime-classroom-of-the-elite-iv', '1', 'dub');
        console.log("Manager DUB Success:", result ? "yes" : "no");
    } catch (e: any) {
        console.log("Manager DUB Error:", e.message);
    }
    
    console.log("\nTesting SourceManager resolveStream SUB...");
    try {
        const result = await manager.getStreamingLinks('gogoanime-classroom-of-the-elite-iv', '1', 'sub');
        console.log("Manager SUB Success:", result ? "yes" : "no");
    } catch (e: any) {
        console.log("Manager SUB Error:", e.message);
    }
}

testCOTE();
