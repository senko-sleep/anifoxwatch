// Run after npm run build, from server/: node testing/provider-diagnostics.mjs
// The same file runs in /app on Koyeb. No frontend, resolver circuits, or negative caches.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lookup } from 'node:dns/promises';
const exec = promisify(execFile);
const imported = async name => import(pathToFileURL(resolve('dist', name)).href);
const cases = [
  { id: 189046, title: 'Re:ZERO -Starting Life in Another World- Season 4', aliases: ['Re:Zero kara Hajimeru Isekai Seikatsu 4th Season'], episode: 14, category: 'dub' },
  { id: 195516, title: 'The Apothecary Diaries Season 3', aliases: ['Kusuriya no Hitorigoto 3rd Season'], episode: 1 },
  { id: 21, title: 'ONE PIECE', aliases: ['One Piece'], episode: 1 },
  { id: 16498, title: 'Attack on Titan', aliases: ['Shingeki no Kyojin'], episode: 2 },
  { id: 177937, title: 'Chainsmoker Cat', aliases: ['Yani Neko'], episode: 2 },
].filter(c => !process.env.DIAG_CASES || process.env.DIAG_CASES.split(',').includes(String(c.id)));
const env = process.env.DIAG_ENV || (process.platform === 'win32' ? 'local' : 'koyeb');
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const category = reason => /403|challenge|cloudflare|cf-chl/i.test(reason) ? 'BOT_OR_IP_BLOCK'
  : /ENOTFOUND|resolve host/i.test(reason) ? 'DNS' : /timeout|timed out|deadline|abort/i.test(reason) ? 'TIMEOUT'
  : /Cannot map|not found/i.test(reason) ? 'MAPPING_OR_UNAVAILABLE' : 'EXTRACTION_OR_MEDIA_FAILURE';
async function http(url, referer = new URL(url).origin + '/') {
  const started = Date.now();
  const row = { url, referer, durationMs: 0, status: null, redirects: [], contentType: null, kind: null };
  try {
    row.dns = await lookup(new URL(url).hostname, { all: true }).catch(e => ({ error: e.code }));
    const { stdout } = await exec(process.platform === 'win32' ? 'curl.exe' : 'curl', [
      '-sS', '-L', '--compressed', '--max-redirs', '5', '--max-time', '6', '--max-filesize', '2097152',
      '-H', `User-Agent: ${ua}`, '-H', `Referer: ${referer}`, '-H', `Origin: ${new URL(referer).origin}`,
      '-H', 'Accept: */*', '-i', '-w', '\n__DIAG_META__%{json}', url,
    ], { encoding: 'utf8', maxBuffer: 3 * 1024 * 1024, windowsHide: true });
    const at = stdout.lastIndexOf('\n__DIAG_META__');
    const meta = JSON.parse(stdout.slice(at + 14));
    row.status = meta.http_code;
    row.contentType = meta.content_type;
    row.remoteIp = meta.remote_ip;
    row.finalUrl = meta.url_effective;
    row.redirects = [...stdout.slice(0, at).matchAll(/^HTTP\/[^\r\n]+\r?\n(?:[^\r\n]+\r?\n)*/gm)]
      .map(m => ({ statusLine: m[0].split(/\r?\n/)[0], location: m[0].match(/^location:\s*(.+)/im)?.[1]?.trim() }));
    const parts = stdout.slice(0, at).split(/\r?\n\r?\n/);
    const body = parts.slice(row.redirects.length).join('\n\n');
    row.kind = /^\s*[\[{]/.test(body) ? 'JSON' : /^\s*#EXTM3U/.test(body) ? 'HLS' : /<html|<!doctype/i.test(body) ? 'HTML' : 'OTHER';
    row.bodyPreview = body.slice(0, 240);
    row.challenge = /Just a moment|cf-chl-|challenge-platform/i.test(body);
    return { row, body };
  } catch (error) { row.error = (error.stderr || error.message).slice(0, 300); row.failureCategory = category(row.error); return { row, body: '' }; }
  finally { row.durationMs = Date.now() - started; }
}
const { streamExtractor } = await imported('services/stream-extractor.js');
const { probeMedia, mediaHeaders } = await imported('services/playable-stream.js');
const constructors = {
  Aniwaves: (await imported('sources/aniwaves-source.js')).AniwavesSource,
  ReAnime: (await imported('sources/reanime-source.js')).ReAnimeSource,
  Yomi: (await imported('sources/yomi-source.js')).YomiSource,
  Anichi: (await imported('sources/anichi-source.js')).AnichiSource,
};
let failures = 0;
for (const c of cases) for (const [name, Constructor] of Object.entries(constructors)) {
  if (process.env.DIAG_PROVIDERS && !process.env.DIAG_PROVIDERS.split(',').includes(name)) continue;
  const started = Date.now();
  const row = { environment: env, provider: name, animeId: c.id, title: c.title, episode: c.episode,
    category: c.category || 'sub', animeFound: null, episodeFound: null, streamsExtracted: 0, streams: [], http: [], memoryBefore: process.memoryUsage() };
  const signal = AbortSignal.timeout(25_000);
  const options = { signal, timeout: 25_000, bypassCache: true, anilistId: c.id, episodeNum: c.episode };
  const provider = new Constructor();
  try {
    if (name === 'ReAnime') {
      for (const url of [`https://reanime.to/api/v1/search?q=${encodeURIComponent(c.title)}`, `https://reanime.to/api/flix/${c.id}/${c.episode}`]) {
        const result = await http(url); row.http.push(result.row);
        if (url.includes('/flix/') && result.body) { try { row.episodeFound = JSON.parse(result.body).servers?.length > 0; } catch {} }
      }
    } else if (name === 'Yomi') {
      for (const url of [`https://vidnest.fun/animepahe/${c.id}/${c.episode}/sub`, `https://tryembed.us.cc/embed/anime/${c.id}/${c.episode}/sub`])
        row.http.push((await http(url)).row);
    } else {
      const url = name === 'Aniwaves' ? `https://aniwaves.ru/ajax/anime/search?keyword=${encodeURIComponent(c.title)}`
        : `https://anichi.to/search?keyword=${encodeURIComponent(c.title)}`;
      row.http.push((await http(url)).row);
    }
    if (process.env.DIAG_HTTP_ONLY === 'true') { row.failureCategory = row.http.some(h => h.status === 403 || h.challenge) ? 'BOT_OR_IP_BLOCK' : 'TRANSPORT_ONLY'; continue; }
    let episodeId = `anilist-${c.id}`;
    if (!provider.acceptsAniListId) {
      let match;
      row.searchResults = [];
      for (const title of [c.title, ...c.aliases]) {
        signal.throwIfAborted();
        const results = (await provider.search(title, 1, undefined, options)).results;
        row.searchResults.push(...results.map(a => ({ id: a.id, title: a.title })));
        const { sameTitle } = await imported('services/stream-resolver.js');
        match = results.find(a => [c.title, ...c.aliases].some(t => sameTitle(t, a.title)));
        if (match) break;
      }
      row.animeFound = !!match;
      if (!match) throw new Error('Exact anime mapping not found');
      row.providerAnimeId = match.id;
      const episodes = await provider.getEpisodes(match.id, options);
      row.episodes = episodes.map(e => ({ id: e.id, number: e.number }));
      const ep = episodes.find(e => Number(e.number) === c.episode);
      row.episodeFound = !!ep;
      if (!ep) throw new Error('Exact episode mapping not found');
      episodeId = ep.id;
    }
    row.episodeId = episodeId;
    const data = await provider.getStreamingLinks(episodeId, undefined, c.category || 'sub', options);
    row.streamsExtracted = data.sources?.length || 0;
    for (const source of data.sources || []) {
      const entry = { type: source.isEmbed ? 'embed' : source.isM3U8 ? 'hls' : 'media', host: new URL(source.url).hostname, valid: false };
      row.streams.push(entry);
      try {
        if (source.isEmbed) {
          const html = await http(source.url, provider.baseUrl + '/'); row.http.push(html.row);
          const extraction = await streamExtractor.extractFromEmbed(source.url, 15_000, true, true, AbortSignal.timeout(17_000));
          entry.playbackVerified = extraction.playbackVerified || false;
          entry.extractedHosts = extraction.streams.map(s => new URL(s.url).hostname);
          entry.error = extraction.error;
          entry.valid = entry.playbackVerified;
          // Custom encrypted FlixCloud manifests must be validated in their native player.
        } else {
          await probeMedia(source.originalUrl || source.url, mediaHeaders(data, source), AbortSignal.timeout(12_000));
          entry.valid = true;
        }
      } catch (error) { entry.error = error.message; entry.failureCategory = category(error.message); }
      if (entry.valid) break;
    }
    row.ok = row.streams.some(s => s.valid);
    if (!row.ok) row.failureCategory = row.streams.length ? 'MEDIA_DELIVERY' : row.http.some(h => h.status === 403 || h.challenge) ? 'BOT_OR_IP_BLOCK' : 'EXTRACTION_EMPTY';
  } catch (error) { row.error = error.message; row.failureCategory = category(error.message); }
  finally {
    row.durationMs = Date.now() - started;
    row.memoryAfter = process.memoryUsage();
    if (!row.ok) failures++;
    console.log('PROVIDER_DIAGNOSTIC ' + JSON.stringify(row));
  }
}
await streamExtractor.close?.();
console.log('PROVIDER_DIAGNOSTIC_SUMMARY ' + JSON.stringify({ environment: env, cases: cases.length, failures }));
// Source clients keep pooled sockets. All diagnostic work has settled above.
process.exit(failures ? 1 : 0);
