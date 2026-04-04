export { BaseAnimeSource, type AnimeSource, type GenreAwareSource } from './base-source.js';

// PRIMARY: AnimeKai — verified working HLS streams (sub + dub) via @consumet/extensions
export { AnimeKaiSource } from './animekai-source.js';

// Adult content source
export { WatchHentaiSource } from './watchhentai-source.js';

// Fallback sources
export { ConsumetSource } from './consumet-source.js';
export { AniwatchSource } from './aniwatch-source.js';
export { GogoanimeSource } from './gogoanime-source.js';
export { NineAnimeSource } from './nineanime-source.js';
export { AniwaveSource } from './aniwave-source.js';
