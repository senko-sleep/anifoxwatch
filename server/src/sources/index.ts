export { BaseAnimeSource, type AnimeSource } from './base-source.js';

// PRIMARY: Direct scrapers (no external API dependency)
export { AnimePaheDirectSource } from './animepahe-direct-source.js';
export { AnimeKaiSource } from './animekai-source.js';

// Adult/Hentai Sources
export { WatchHentaiSource } from './watchhentai-source.js';
export { HanimeSource } from './hanime-source.js';
export { ConsumetSource } from './consumet-source.js';
export { AniwatchSource } from './aniwatch-source.js';
export { GogoanimeSource } from './gogoanime-source.js';
export { NineAnimeSource } from './nineanime-source.js';
export { AniwaveSource } from './aniwave-source.js';

// ===== NEW BACKUP SOURCES (20+ alternatives) =====

// High Priority Backups
export { ZoroSource } from './zoro-source.js';
export { AnimePaheSource } from './animepahe-source.js';
export { AnimeSugeSource } from './animesuge-source.js';
export { KaidoSource } from './kaido-source.js';
export { AnixSource } from './anix-source.js';

// Medium Priority Backups
export { KickassAnimeSource } from './kickassanime-source.js';
export { YugenAnimeSource } from './yugenanime-source.js';
export { AniMixPlaySource } from './animixplay-source.js';
export { AnimeFoxSource } from './animefox-source.js';
export { AnimeDAOSource } from './animedao-source.js';

// Regional/Alternative Sources
export { AnimeFLVSource } from './animeflv-source.js';
export { AnimeSaturnSource } from './animesaturn-source.js';
export { CrunchyrollSource } from './crunchyroll-source.js';

// Additional Backups
export { AnimeOnsenSource } from './animeonsen-source.js';
export { MarinSource } from './marin-source.js';
export { AnimeHeavenSource } from './animeheaven-source.js';
export { AnimeKisaSource } from './animekisa-source.js';
export { AnimeOwlSource } from './animeowl-source.js';
export { AnimeLandSource } from './animeland-source.js';
export { AnimeFreakSource } from './animefreak-source.js';

// Miruro: miruro.in metadata + Consumet Zoro (aniwatchtv.to) for streams
export { MiruroSource } from './miruro-source.js';

// AllAnime: allanime.day GraphQL API + fast4speed.rsvp CDN (cloud-IP accessible)
export { AllAnimeSource } from './allanime-source.js';

