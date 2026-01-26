import { Anime, TopAnime } from '@/types/anime';

export const mockAnimeList: Anime[] = [
  {
    id: '1',
    title: 'Solo Leveling Season 2',
    titleJapanese: '俺だけレベルアップな件',
    image: 'https://cdn.myanimelist.net/images/anime/1892/144781.jpg',
    description: 'After being given a second chance at life, Sung Jinwoo rises from the weakest hunter to the strongest.',
    type: 'TV',
    status: 'Ongoing',
    rating: 9.2,
    episodes: 24,
    episodesAired: 8,
    duration: '24m',
    genres: ['Action', 'Adventure', 'Fantasy'],
    studios: ['A-1 Pictures'],
    season: 'Winter',
    year: 2025,
    subCount: 8,
    dubCount: 6,
    isMature: false,
  },
  {
    id: '2',
    title: 'Demon Slayer: Infinity Castle Arc',
    titleJapanese: '鬼滅の刃',
    image: 'https://cdn.myanimelist.net/images/anime/1908/120036.jpg',
    description: 'Tanjiro and the Hashira face their ultimate battle against Muzan in the Infinity Castle.',
    type: 'TV',
    status: 'Upcoming',
    rating: 9.5,
    episodes: 26,
    episodesAired: 0,
    duration: '24m',
    genres: ['Action', 'Supernatural', 'Drama'],
    studios: ['ufotable'],
    season: 'Spring',
    year: 2025,
    subCount: 0,
    dubCount: 0,
    isMature: false,
  },
  {
    id: '3',
    title: 'One Piece',
    titleJapanese: 'ワンピース',
    image: 'https://cdn.myanimelist.net/images/anime/1244/138851.jpg',
    description: 'Follow Luffy and the Straw Hat Pirates on their adventure to find the legendary treasure One Piece.',
    type: 'TV',
    status: 'Ongoing',
    rating: 9.1,
    episodes: 1150,
    episodesAired: 1130,
    duration: '24m',
    genres: ['Action', 'Adventure', 'Comedy'],
    studios: ['Toei Animation'],
    season: 'Fall',
    year: 1999,
    subCount: 1130,
    dubCount: 1100,
    isMature: false,
  },
  {
    id: '4',
    title: 'Jujutsu Kaisen Season 3',
    titleJapanese: '呪術廻戦',
    image: 'https://cdn.myanimelist.net/images/anime/1171/109222.jpg',
    description: 'The Culling Game continues as sorcerers battle for survival in the deadly tournament.',
    type: 'TV',
    status: 'Ongoing',
    rating: 8.9,
    episodes: 24,
    episodesAired: 12,
    duration: '24m',
    genres: ['Action', 'Supernatural', 'School'],
    studios: ['MAPPA'],
    season: 'Winter',
    year: 2025,
    subCount: 12,
    dubCount: 10,
    isMature: true,
  },
  {
    id: '5',
    title: 'Attack on Titan: The Final Season',
    titleJapanese: '進撃の巨人',
    image: 'https://cdn.myanimelist.net/images/anime/1948/120625.jpg',
    description: 'The epic conclusion to the battle between humanity and the Titans.',
    type: 'TV',
    status: 'Completed',
    rating: 9.4,
    episodes: 16,
    episodesAired: 16,
    duration: '24m',
    genres: ['Action', 'Drama', 'Fantasy', 'Military'],
    studios: ['MAPPA'],
    season: 'Winter',
    year: 2024,
    subCount: 16,
    dubCount: 16,
    isMature: true,
  },
  {
    id: '6',
    title: 'Frieren: Beyond Journey\'s End S2',
    titleJapanese: '葬送のフリーレン',
    image: 'https://cdn.myanimelist.net/images/anime/1015/138006.jpg',
    description: 'The elf mage Frieren continues her journey of understanding humanity after the death of her companions.',
    type: 'TV',
    status: 'Ongoing',
    rating: 9.3,
    episodes: 28,
    episodesAired: 6,
    duration: '24m',
    genres: ['Adventure', 'Drama', 'Fantasy'],
    studios: ['Madhouse'],
    season: 'Winter',
    year: 2025,
    subCount: 6,
    dubCount: 4,
    isMature: false,
  },
  {
    id: '7',
    title: 'Chainsaw Man Season 2',
    titleJapanese: 'チェンソーマン',
    image: 'https://cdn.myanimelist.net/images/anime/1806/126216.jpg',
    description: 'Denji continues his chaotic life as a Devil Hunter in the Public Safety Division.',
    type: 'TV',
    status: 'Upcoming',
    rating: 8.8,
    episodes: 12,
    duration: '24m',
    genres: ['Action', 'Supernatural', 'Horror'],
    studios: ['MAPPA'],
    season: 'Fall',
    year: 2025,
    subCount: 0,
    dubCount: 0,
    isMature: true,
  },
  {
    id: '8',
    title: 'Spy x Family Season 3',
    titleJapanese: 'SPY×FAMILY',
    image: 'https://cdn.myanimelist.net/images/anime/1441/122795.jpg',
    description: 'The Forger family continues their mission while maintaining their secret identities.',
    type: 'TV',
    status: 'Ongoing',
    rating: 8.7,
    episodes: 24,
    episodesAired: 10,
    duration: '24m',
    genres: ['Action', 'Comedy', 'Slice of Life'],
    studios: ['WIT Studio', 'CloverWorks'],
    season: 'Winter',
    year: 2025,
    subCount: 10,
    dubCount: 8,
    isMature: false,
  },
];

export const topAnimeList: TopAnime[] = mockAnimeList
  .sort((a, b) => (b.rating || 0) - (a.rating || 0))
  .slice(0, 10)
  .map((anime, index) => ({
    rank: index + 1,
    anime,
  }));

export const getAnimeById = (id: string): Anime | undefined => {
  return mockAnimeList.find(anime => anime.id === id);
};

export const searchAnime = (query: string): Anime[] => {
  const lowerQuery = query.toLowerCase();
  return mockAnimeList.filter(
    anime =>
      anime.title.toLowerCase().includes(lowerQuery) ||
      anime.titleJapanese?.toLowerCase().includes(lowerQuery) ||
      anime.genres.some(genre => genre.toLowerCase().includes(lowerQuery))
  );
};

export const getAnimeByGenre = (genre: string): Anime[] => {
  return mockAnimeList.filter(anime =>
    anime.genres.some(g => g.toLowerCase() === genre.toLowerCase())
  );
};

export const getTrendingAnime = (): Anime[] => {
  return mockAnimeList.filter(anime => anime.status === 'Ongoing').slice(0, 8);
};

export const getLatestAnime = (): Anime[] => {
  return [...mockAnimeList]
    .sort((a, b) => (b.year || 0) - (a.year || 0))
    .slice(0, 8);
};
