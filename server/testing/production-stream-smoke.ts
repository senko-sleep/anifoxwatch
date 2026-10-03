import { performance } from 'node:perf_hooks';

const api = (process.env.SMOKE_API_URL || 'https://poor-marne-sssssenko-05a416b4.koyeb.app').replace(/\/$/, '');
const frontend = (process.env.SMOKE_FRONTEND_URL || 'https://anifoxwatch.web.app').replace(/\/$/, '');
const cases = (process.env.SMOKE_CASES || '195516:1,210031:1,210031:2')
  .split(',').map(value => value.trim()).filter(Boolean).map(value => {
    const [id, ep] = value.split(':');
    return { id: Number(id), episode: Number(ep || 1) };
  });
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 45_000);
const maxResolutionMs = Number(process.env.SMOKE_MAX_RESOLUTION_MS || 43_000);
const rounds = Math.max(1, Math.min(3, Number(process.env.SMOKE_ROUNDS || 2)));

const watchPaths: Record<number, (ep: number) => string> = {
  195516: ep => `/watch/anime/the-apothecary-diaries-season-3-195516?ep=${ep}&s=3`,
  210031: ep => `/watch/anime/you-and-i-are-polar-opposites-season-2-210031?lang=sub&ep=${ep}&s=2`,
};

async function getJson(path: string, timeout = timeoutMs) {
  const response = await fetch(`${api}${path}`, { signal: AbortSignal.timeout(timeout), headers: { Accept: 'application/json' } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`${path} returned non-JSON: ${text.slice(0, 120)}`); }
}

async function readPrefix(url: string, maxBytes = 64 * 1024) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { Range: `bytes=0-${maxBytes - 1}` } });
  if (!response.ok) throw new Error(`media returned ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('media response has no body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < maxBytes) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      chunks.push(value.subarray(0, maxBytes - size));
      size += value.length;
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return { response, bytes: Buffer.concat(chunks.map(chunk => Buffer.from(chunk))) };
}

async function validateSource(source: any) {
  if (source.isEmbed) throw new Error(`provider returned an iframe (${source.url}); embed playback must be verified in a browser`);
  const url = source.url;
  if (!/^https?:\/\//i.test(url || '')) throw new Error('source URL is not absolute HTTP(S)');
  const first = await readPrefix(url);
  const prefix = first.bytes.toString('utf8').trim();
  if (prefix.startsWith('#EXTM3U')) {
    const uris = prefix.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    if (!uris.length) throw new Error('HLS manifest has no child playlist or segment');
    const childUrl = new URL(uris[0], url).href;
    const child = await readPrefix(childUrl, 16 * 1024);
    const childText = child.bytes.toString('utf8').trim();
    if (childText.startsWith('#EXTM3U')) {
      const segment = childText.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#'));
      if (!segment) throw new Error('HLS media playlist has no segments');
      const media = await readPrefix(new URL(segment, childUrl).href, 4096);
      const bytes = media.bytes;
      const isTs = bytes.length > 188 && bytes[0] === 0x47 && bytes[188] === 0x47;
      const box = bytes.length > 12 && /^(ftyp|styp|moof|sidx|moov)$/.test(bytes.toString('ascii', 4, 8));
      if (!isTs && !box) throw new Error('HLS segment is empty or not recognizable media');
      return { kind: 'hls', manifestStatus: first.response.status, childStatus: child.response.status,
        segmentStatus: media.response.status, bytes: media.bytes.length };
    }
    const bytes = child.bytes;
    const isTs = bytes.length > 188 && bytes[0] === 0x47 && bytes[188] === 0x47;
    const box = bytes.length > 12 && /^(ftyp|styp|moof|sidx|moov)$/.test(bytes.toString('ascii', 4, 8));
    if (!isTs && !box) throw new Error('HLS child is neither a media playlist nor a media segment');
    return { kind: 'hls', manifestStatus: first.response.status, segmentStatus: child.response.status, bytes: child.bytes.length };
  }
  const bytes = first.bytes;
  const isTs = bytes.length > 188 && bytes[0] === 0x47 && bytes[188] === 0x47;
  const box = bytes.length > 12 && /^(ftyp|styp|moof|sidx|moov)$/.test(bytes.toString('ascii', 4, 8));
  const webm = bytes.length > 4 && bytes.readUInt32BE(0) === 0x1a45dfa3;
  if (!isTs && !box && !webm) throw new Error(`source body is not media (${first.response.headers.get('content-type') || 'no content-type'})`);
  return { kind: 'media', status: first.response.status, bytes: bytes.length };
}

let failures = 0;
const reports: Record<string, unknown>[] = [];
for (let round = 1; round <= rounds; round++) for (const testCase of cases) {
  const started = performance.now();
  const row: Record<string, unknown> = { round, animeId: testCase.id, episode: testCase.episode, frontend };
  let memoryBefore: any;
  try {
    row.stage = 'frontend_document';
    const watchPath = watchPaths[testCase.id]?.(testCase.episode) || `/watch/anime/anilist-${testCase.id}?ep=${testCase.episode}`;
    const pageResponse = await fetch(`${frontend}${watchPath}`, { signal: AbortSignal.timeout(8_000) });
    const html = await pageResponse.text();
    if (!pageResponse.ok || !html.includes('id="root"')) throw new Error(`production frontend returned ${pageResponse.status} or no app root`);
    const scriptPath = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
    if (!scriptPath) throw new Error('production frontend entry script was missing');
    row.stage = 'frontend_script';
    const scriptResponse = await fetch(new URL(scriptPath, frontend), { signal: AbortSignal.timeout(8_000) });
    if (!scriptResponse.ok) throw new Error(`production frontend script returned ${scriptResponse.status}`);
    row.frontendStatus = pageResponse.status;
    row.frontendScriptStatus = scriptResponse.status;
    row.stage = 'api_health_before';
    memoryBefore = await getJson('/api/health', 5_000);
    row.serverMemoryBefore = memoryBefore.memory;
    row.stage = 'anilist_episodes';
    let episodes = await getJson(`/api/anime/episodes?id=anilist-${testCase.id}`, 20_000);
    let identity: any = {};
    if (!Array.isArray(episodes.episodes) || episodes.episodes.length === 0) {
      row.stage = 'native_identity_lookup';
      identity = await getJson(`/api/anime/resolve?id=anilist-${testCase.id}`, 20_000);
      if (identity.streamingId) {
        row.stage = 'native_episode_list';
        episodes = await getJson(`/api/anime/episodes?id=${encodeURIComponent(identity.streamingId)}`, 20_000);
        row.episodeMetadataFallback = identity.streamingId;
      }
    }
    if (!Array.isArray(episodes.episodes) || episodes.episodes.length < testCase.episode)
      throw new Error(`episode metadata did not include episode ${testCase.episode}`);
    row.episodeCount = episodes.episodes.length;
    const episode = episodes.episodes.find((entry: any) => Number(entry.number) === testCase.episode);
    const episodeId = episode?.id || identity.streamingId;
    if (!episodeId) throw new Error('no streaming episode identity returned');
    row.episodeId = episodeId;
    const params = new URLSearchParams({ ep_num: String(testCase.episode), anilist_id: String(testCase.id),
      title: identity.title || `anilist-${testCase.id}`, category: 'sub', ...(round > 1 ? { nocache: 'true' } : {}) });
    const streamStarted = performance.now();
    row.stage = 'stream_resolve';
    const streamResponse = await fetch(`${api}/api/stream/watch/${encodeURIComponent(episodeId)}?${params}`, {
      signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' },
    });
    const stream = await streamResponse.json();
    row.resolveMs = Math.round(performance.now() - streamStarted);
    row.provider = stream.source || stream.server;
    row.providersAttempted = stream.triedServers || stream.attempts?.map((attempt: any) => attempt.provider) || [];
    row.providerAttempts = stream.attempts || [];
    if (!streamResponse.ok) throw new Error(`stream API returned ${streamResponse.status}: ${stream.error || 'no source'}`);
    if (row.resolveMs > maxResolutionMs) throw new Error(`resolution exceeded ${maxResolutionMs}ms reliability threshold`);
    if (!stream.sources?.length) throw new Error('resolver returned no sources');
    row.stage = 'stream_validation';
    let validationError: unknown;
    for (const source of stream.sources) {
      try { row.validation = await validateSource(source); validationError = undefined; break; }
      catch (error) { validationError = error; }
    }
    if (validationError) throw validationError;
    row.ok = true;
  } catch (error) {
    row.ok = false;
    row.failedStage = row.stage;
    row.failure = error instanceof Error ? error.message : String(error);
    failures++;
  }
  try {
    row.stage = 'api_health_after';
    const memoryAfter = await getJson('/api/health', 5_000);
    row.serverMemoryAfter = memoryAfter.memory;
    if (memoryBefore && memoryAfter.memory?.rss && memoryBefore.memory?.rss)
      row.serverRssDeltaBytes = memoryAfter.memory.rss - memoryBefore.memory.rss;
  } catch (error) { row.memoryProbeFailure = error instanceof Error ? error.message : String(error); }
  row.totalMs = Math.round(performance.now() - started);
  reports.push(row);
  console.log(JSON.stringify(row));
}
const successes = reports.filter(row => row.ok).length;
console.log(JSON.stringify({ type: 'production_stream_smoke_summary', api, frontend, rounds, cases: cases.length,
  successes, failures, providers: [...new Set(reports.map(row => row.provider).filter(Boolean))],
  samples: reports.length, timingsMs: reports.map(row => row.totalMs),
  serverRssBytes: reports.map(row => (row.serverMemoryAfter as any)?.rss).filter(Number.isFinite) }));
if (failures) process.exitCode = 1;
