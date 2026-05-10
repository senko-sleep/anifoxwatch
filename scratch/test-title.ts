function extractRawId(id: string): string {
    return id.replace(/^(gogoanime|animekai|9anime|aniwave|aniwatch|miruro|allanime)-/i, '');
}

function episodeIdToFallbackSearchTitle(episodeId: string): string {
    let slug = episodeId.split('?')[0];
    const dollar = slug.indexOf('$');
    if (dollar !== -1) slug = slug.slice(0, dollar);
    slug = extractRawId(slug);
    
    // Strip common episode suffixes: -episode-1, -ep-1, -1, etc.
    // Also strips Miruro/HiAnime hashes like -vwmk
    slug = slug.replace(/-episode-\d+$/i, '')
              .replace(/-ep-\d+$/i, '')
              .replace(/-\d+$/i, '')
              .replace(/-[a-z\d]{4,6}$/i, ''); // Strip hashes like -vwmk
    
    return slug.replace(/[-_]/g, ' ').trim();
}

console.log('ID: a-silent-voice-vwmk-episode-1');
console.log('Title:', episodeIdToFallbackSearchTitle('a-silent-voice-vwmk-episode-1'));

console.log('ID: one-piece-episode-1000');
console.log('Title:', episodeIdToFallbackSearchTitle('one-piece-episode-1000'));

console.log('ID: spy-x-family-part-2-12');
console.log('Title:', episodeIdToFallbackSearchTitle('spy-x-family-part-2-12'));
