import { sourceManager } from '../src/services/source-manager.js';

// Quick ID lookup helper
async function lookupId(label: string, query: string): Promise<void> {
  try {
    const r = await sourceManager.search(query, 1);
    const top = r.results.slice(0, 3).map(x => ({ id: x.id, title: x.title, source: x.source }));
    console.log(`${label}: ${JSON.stringify(top)}`);
  } catch (e: any) {
    console.log(`${label}: ERROR ${e.message}`);
  }
}

(async () => {
  await lookupId('Naruto', 'Naruto Shippuden');
  await lookupId('NarutoOG', 'Naruto');
  await lookupId('JJK', 'Jujutsu Kaisen');
  await lookupId('DemonSlayer', 'Demon Slayer');
  process.exit(0);
})().catch(console.error);
