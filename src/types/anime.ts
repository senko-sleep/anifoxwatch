export interface Anime {
  id: string;
  title: string;
  titleJapanese?: string;
  image: string;
  cover?: string;
  banner?: string;
  description: string;
  type: 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special';
  status: 'Ongoing' | 'Completed' | 'Upcoming';
  rating?: number;
  episodes: number;
  episodesAired?: number;
  duration?: string;
  genres: string[];
  studios?: string[];
  season?: string;
  year?: number;
  subCount?: number;
  dubCount?: number;
  isMature?: boolean;
  source?: string;
  // AniList specific fields
  bannerImage?: string;
  coverImage?: string;
}

export interface Episode {
  id: string;
  number: number;
  title: string;
  isFiller?: boolean;
  hasSub: boolean;
  hasDub: boolean;
  thumbnail?: string;
}

export interface StreamingSource {
  id: string;
  name: string;
  type: 'sub' | 'dub';
  quality: string;
  url: string;
}

export interface AnimeSearchResult {
  results: Anime[];
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
}

export interface TopAnime {
  rank: number;
  anime: Anime;
}
