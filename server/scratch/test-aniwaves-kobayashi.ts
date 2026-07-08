import { AniwavesSource } from '../src/sources/aniwaves-source.js';

const src = new AniwavesSource();
const q = "Miss Kobayashi's Dragon Maid: A lonely dragon wants to be loved";
const r = await src.search(q, 1);
console.log('count', r.results?.length);
console.log(JSON.stringify(r.results?.slice(0, 5).map(x => ({ id: x.id, title: x.title, type: x.type, eps: x.episodes })), null, 2));
