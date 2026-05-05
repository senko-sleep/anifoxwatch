import { AnimeKaiSource } from './src/sources/animekai-source.js';
const source = new AnimeKaiSource();
source.getStreamingLinks('animekai-tongari-boushi-no-atelier$ep=1$token=xxx', undefined, 'dub').then(r => console.log(JSON.stringify(r))).catch(e => console.error(e));
