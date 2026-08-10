async function test() {
  const t0 = Date.now();
  const result = await fetch('http://localhost:3001/api/stream/watch/anilist-207141?ep=2&category=sub&ep_num=2&anilist_id=207141', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(60000)
  });
  const data = await result.json();
  const elapsed = Date.now() - t0;
  console.log(`Status: ${result.status} (${elapsed}ms)`);
  console.log(`Source: ${data.source || 'none'}`);
  console.log(`Sources: ${data.sources?.length || 0}`);
  if (data.error) console.log(`Error: ${data.error}`);
  if (data.sources?.length > 0) {
    data.sources.forEach((s, i) => console.log(`  [${i}] ${s.quality} m3u8=${s.isM3U8}`));
  }
}
test();
