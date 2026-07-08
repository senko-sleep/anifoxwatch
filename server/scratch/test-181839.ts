import { sourceManager } from '../src/services/source-manager.js';

const id = 181839;
const resolved = await sourceManager.resolveAniListToStreamingId(id);
console.log('resolve', resolved);
const eps = await sourceManager.getEpisodes(`anilist-${id}`);
console.log('episodes', eps.length, eps.slice(0, 2));
