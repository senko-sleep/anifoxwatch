/**
 * Quick smoke: Miruro getStreamingLinks for aniwatch-style episode IDs.
 * Run: npx tsx testing/test-miruro-stream.ts
 */
import { MiruroSource } from '../src/sources/miruro-source.js';

const src = new MiruroSource();

const samples = [
  'spy-x-family-part-2-18152?ep=94388',
  'mata-korosarete-shimatta-no-desu-ne-tantei-sama-m33kg$ep=1$token=esLm8f3zqhK81g',
];

async function main() {
  for (const id of samples) {
    console.log('\n---', id);
    const data = await src.getStreamingLinks(id, undefined, 'sub');
    console.log('sources:', data.sources?.length ?? 0, data.sources?.[0]?.url?.slice(0, 90));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
