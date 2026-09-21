const Q = `query ($page: Int, $perPage: Int, $sort: [MediaSort], $excluded: [String], $genre: String, $tag: String, $search: String) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { currentPage lastPage hasNextPage }
    media(type: ANIME, isAdult: true, tag_not_in: $excluded, sort: $sort, genre: $genre, tag: $tag, search: $search) { id title { romaji } }
  }
}`;
const call = async (label, vars) => {
  const r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: Q, variables: { page: 1, perPage: 30, excluded: ['Primarily Child Cast'], ...vars } }) });
  const j = await r.json().catch(() => ({}));
  console.log(label.padEnd(28), r.status, j.errors ? JSON.stringify(j.errors.map(e => e.message)) : `ok n=${j.data?.Page?.media?.length}`);
};
await call('trending', { sort: ['TRENDING_DESC'] });
await call('popular', { sort: ['POPULARITY_DESC'] });
await call('genre Romance', { sort: ['POPULARITY_DESC'], genre: 'Romance' });
await call('genre Comedy', { sort: ['POPULARITY_DESC'], genre: 'Comedy' });
await call('tag Omegaverse', { sort: ['POPULARITY_DESC'], tag: 'Omegaverse' });
await call('page 999999', { sort: ['POPULARITY_DESC'], page: 999999 });
await call('rating', { sort: ['SCORE_DESC'] });
