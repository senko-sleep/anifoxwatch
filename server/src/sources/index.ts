export { BaseAnimeSource, type AnimeSource } from './base-source.js';

// Primary source - HiAnime (most reliable, uses aniwatch-api)
export { HiAnimeSource } from './hianime-source.js';

// Legacy sources (for fallback/backward compatibility)
export { ConsumetSource } from './consumet-source.js';
export { AniwatchSource } from './aniwatch-source.js';
export { GogoanimeSource } from './gogoanime-source.js';
export { NineAnimeSource } from './nineanime-source.js';
export { AniwaveSource } from './aniwave-source.js';
