import { AnimeKaiSource } from "./src/sources/animekai-source.js";
const source = new AnimeKaiSource();
source.getStreamingLinks("witch-hat-atelier-3e32$ep=1$token=e4WzpOzxuw3viW9fiozb", undefined, "dub").then(r => console.log(JSON.stringify(r))).catch(e => console.error(e));
