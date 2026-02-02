export { BaseAnimeSource, type AnimeSource } from './base-source.js';

// Primary source - HiAnimeDirect (uses aniwatch package directly for deep scraping)
export { HiAnimeDirectSource } from './hianime-direct-source.js';

// Adult/Hentai Source - WatchHentai (JWPlayer MP4 streaming)
export { WatchHentaiSource } from './watchhentai-source.js';

// Secondary source - HiAnime (uses external APIs)
export { HiAnimeSource } from './hianime-source.js';

// Legacy sources (for fallback/backward compatibility)
export { ConsumetSource } from './consumet-source.js';
export { AniwatchSource } from './aniwatch-source.js';
export { GogoanimeSource } from './gogoanime-source.js';
export { NineAnimeSource } from './nineanime-source.js';
export { AniwaveSource } from './aniwave-source.js';

