export interface Anime {
  id: string;
  streamingId?: string; // The actual streaming source ID for navigation
  title: string;
  titleEnglish?: string;
  titleRomaji?: string;
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
  /** Published without censor bars (adult catalog). */
  uncensored?: boolean;
  /** Adult catalog: which sites can play this title. Empty = listed, but no site carries it. */
  watchableOn?: string[];
  source?: string;
  // AniList specific fields
  bannerImage?: string;
  coverImage?: string;
  /** AniList cover colour (hex) — drives each title's on-page accent lighting. */
  accentColor?: string;
  nextAiringEpisode?: number;
  timeUntilAiring?: number; // in seconds
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
  totalResults?: number;
}

export interface TopAnime {
  rank: number;
  anime: Anime;
}
