import { MiruroSource } from '../src/sources/miruro-source.js';
import { probeMedia } from '../src/services/playable-stream.js';

const title = process.argv[2] || 'Re:ZERO -Starting Life in Another World- Season 4';
const episodeNumber = Number(process.argv[3] || 14);
const category = process.argv[4] === 'sub' ? 'sub' : 'dub';
const source = new MiruroSource();
const started = Date.now();
const search = await source.search(title);
const anime = search.results.find(result => result.title.toLowerCase().replace(/[^a-z0-9]/g, '') === title.toLowerCase().replace(/[^a-z0-9]/g, ''));
if (!anime) throw new Error(`Miruro did not find exact title: ${title}; candidates=${search.results.map(result => result.title).join(', ')}`);
const episodes = await source.getEpisodes(anime.id);
const episode = episodes.find(item => item.number === episodeNumber);
if (!episode) throw new Error(`Miruro did not list episode ${episodeNumber}`);
const stream = await source.getStreamingLinks(episode.id, undefined, category);
if (!stream.sources.length) throw new Error(`Miruro yielded no ${category} source for episode ${episodeNumber}`);
await probeMedia(stream.sources[0].url, stream.sources[0].headers || {}, AbortSignal.timeout(10_000));
console.log(JSON.stringify({ title: anime.title, episode: episode.number, category,
    provider: stream.source, sourceHost: new URL(stream.sources[0].url).hostname,
    sources: stream.sources.length, subtitles: stream.subtitles.length, elapsedMs: Date.now() - started,
    mediaProbe: 'passed' }));
