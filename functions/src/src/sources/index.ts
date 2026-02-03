export { BaseAnimeSource, type AnimeSource, type GenreAwareSource } from './base-source.js';

// Primary source - HiAnimeDirect (uses aniwatch package directly for deep scraping)
export { HiAnimeDirectSource } from './hianime-direct-source.js';

// Secondary source - HiAnime (uses external APIs)
export { HiAnimeSource } from './hianime-source.js';

// Adult content source
export { WatchHentaiSource } from './watchhentai-source.js';

// Legacy sources (for fallback/backward compatibility)
export { ConsumetSource } from './consumet-source.js';
export { AniwatchSource } from './aniwatch-source.js';
export { GogoanimeSource } from './gogoanime-source.js';
export { NineAnimeSource } from './nineanime-source.js';
export { AniwaveSource } from './aniwave-source.js';
