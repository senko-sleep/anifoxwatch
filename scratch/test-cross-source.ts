import { sourceManager } from '../server/src/services/source-manager.js';

async function test() {
  console.log("Testing cross-source fallback for anilist-189046?ep=1");
  try {
    const data = await sourceManager.crossSourceStreamingFallback("anilist-189046?ep=1", undefined, "sub", 1, 189046);
    console.log("Result:", data);
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
