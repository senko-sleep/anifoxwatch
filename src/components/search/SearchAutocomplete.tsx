import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, X, Play, Star, TrendingUp, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { fetchAniListGraphQLFast } from '@/lib/anilist-graphql';
import { mapAniListMediaToAnime, type AniListHomeMedia } from '@/lib/anilist-home-queries';
import { cn, normalizeRating } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface SearchResult {
  id: string;
  title: string;
  titleEnglish?: string;
  titleRomaji?: string;
  image: string;
  description?: string;
  type?: string;
  status?: string;
  rating?: number;
  imdbRating?: number;
  genres?: string[];
  subCount?: number;
  dubCount?: number;
  voiceActors?: Array<{
    name: string;
    image: string;
    character?: string;
  }>;
}

interface SearchAutocompleteProps {
  onClose: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  className?: string;
  isMobile?: boolean;
}

const POPULAR_SEARCHES = [
  'Naruto', 'One Piece', 'Attack on Titan', 'Demon Slayer',
  'Jujutsu Kaisen', 'My Hero Academia', 'Dragon Ball', 'Bleach'
];

const suggestionCache = new Map<string, SearchResult[]>();

async function fetchSuggestions(q: string): Promise<SearchResult[]> {
  const key = q.trim().toLowerCase();
  const cached = suggestionCache.get(key);
  if (cached) return cached;

  const gql = `{
    Page(page:1,perPage:6) {
      media(search:${JSON.stringify(q)},type:ANIME,isAdult:false,sort:SEARCH_MATCH) {
        id
        title { romaji english }
        coverImage { extraLarge large }
        bannerImage
        description
        genres
        episodes
        duration
        format
        status
        averageScore
        popularity
        seasonYear
        season
        studios(isMain:true) { nodes { name } }
      }
    }
  }`;

  const response = await fetchAniListGraphQLFast({ query: gql });
  if (!response.ok) throw new Error(`AniList ${response.status}`);
  const body = await response.json() as {
    errors?: { message?: string }[];
    data?: { Page?: { media?: AniListHomeMedia[] } };
  };
  if (body.errors?.length) throw new Error(body.errors[0]?.message || 'AniList search failed');

  const results = (body.data?.Page?.media || []).map((media) => mapAniListMediaToAnime(media));
  suggestionCache.set(key, results);
  if (suggestionCache.size > 40) {
    const oldest = suggestionCache.keys().next().value;
    if (oldest) suggestionCache.delete(oldest);
  }
  return results;
}

export const SearchAutocomplete = ({ onClose, inputRef, className, isMobile }: SearchAutocompleteProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const requestSeqRef = useRef(0);
  const localInputRef = useRef<HTMLInputElement>(null);
  const effectiveInputRef = inputRef || localInputRef;

  // Debounced search
  const performSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setShowDropdown(q.length > 0);
      return;
    }

    const requestSeq = ++requestSeqRef.current;
    setIsLoading(true);
    try {
      const data = await fetchSuggestions(q);
      if (requestSeq !== requestSeqRef.current) return;
      setResults(data);
      setShowDropdown(true);
    } catch {
      if (requestSeq !== requestSeqRef.current) return;
      setResults([]);
    } finally {
      if (requestSeq !== requestSeqRef.current) return;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length === 0) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(() => performSearch(query.trim()), 120);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, performSearch]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setQuery('');
      setShowDropdown(false);
      onClose();
    }
  };

  const handleSelect = (result: SearchResult) => {
    navigate(`/watch?id=${encodeURIComponent(result.id)}`, {
      state: { from: location.pathname + location.search }
    });
    setQuery('');
    setShowDropdown(false);
    onClose();
  };

  const handlePopularClick = (term: string) => {
    setQuery(term);
    performSearch(term);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      onClose();
    }
  };

  return (
    <div ref={containerRef} className={cn("relative min-w-0 w-full", className)}>
      <form onSubmit={handleSubmit} className="relative min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={effectiveInputRef as React.RefObject<HTMLInputElement>}
          type="text"
          placeholder="Search anime..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(-1);
          }}
          onFocus={() => query.length > 0 && setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          className="h-11 w-full min-w-0 rounded-xl border-white/10 bg-[#0c1018] pl-10 pr-16 text-[15px] shadow-none focus-visible:border-fox-orange/50 focus-visible:ring-2 focus-visible:ring-fox-orange/15"
          autoFocus
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]); setShowDropdown(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {isLoading && (
          <Loader2 className="absolute right-9 top-1/2 -translate-y-1/2 w-4 h-4 text-fox-orange animate-spin" />
        )}
      </form>

      {/* Dropdown */}
      {showDropdown && (
        <div className={cn(
          "absolute top-full z-[100] mt-3 overflow-hidden rounded-xl border border-white/10 bg-[#090c12]/98 shadow-2xl shadow-black/40 backdrop-blur-xl",
          isMobile ? "left-0 right-0 max-h-[70vh]" : "right-0 w-[min(34rem,calc(100vw-2rem))] max-h-[520px]"
        )}>
          {/* Results */}
          {results.length > 0 ? (
            <div className="overflow-y-auto max-h-[460px]">
              {/* Results count */}
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5 text-xs text-zinc-500">
                <span>{results.length} result{results.length === 1 ? '' : 's'}</span>
                <span className="hidden sm:inline text-zinc-600">AniList instant search</span>
              </div>

              {results.map((result, i) => {
                const rating = normalizeRating(result.rating);
                const displayTitle = result.titleEnglish || result.title || result.titleRomaji || '';
                const isAiring = result.status === 'Ongoing';
                
                return (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={cn(
                      "w-full flex gap-3 px-4 py-3 text-left transition-colors border-b border-white/5 last:border-b-0",
                      selectedIndex === i 
                        ? "bg-fox-orange/10" 
                        : "hover:bg-white/[0.04]"
                    )}
                  >
                    {/* Thumbnail */}
                    <div className="w-14 h-20 rounded-md overflow-hidden bg-zinc-900 flex-shrink-0 ring-1 ring-white/10 shadow-lg">
                      <img
                        src={result.image}
                        alt={displayTitle}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-white truncate leading-tight" title={displayTitle}>
                          {displayTitle}
                        </p>
                        {rating && rating >= 1 && (
                          <span className="shrink-0 flex items-center gap-0.5 text-xs font-medium text-amber-400">
                            <Star className="w-3 h-3 fill-amber-400" />
                            {rating.toFixed(1)}
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      {result.description && (
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                          {result.description}
                        </p>
                      )}

                      {/* Genre Tags */}
                      {result.genres && result.genres.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {result.genres.slice(0, 4).map((genre, idx) => (
                            <span
                              key={`${genre}-${idx}`}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.06] text-zinc-300 border border-white/10"
                            >
                              {genre}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* VA Avatars */}
                      {result.voiceActors && result.voiceActors.length > 0 && (
                        <div className="flex items-center gap-1 mt-2">
                          {result.voiceActors.slice(0, 3).map((va, idx) => (
                            <div
                              key={`${va.name}-${idx}`}
                              className="w-6 h-6 rounded-full overflow-hidden ring-1 ring-white/20"
                              title={va.name}
                            >
                            <img
                                src={va.image}
                                alt={va.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                            />
                            </div>
                          ))}
                          {result.voiceActors.length > 3 && (
                            <span className="text-[10px] text-zinc-500">+{result.voiceActors.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Play icon */}
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-white/5 hover:bg-fox-orange/20 flex items-center justify-center transition-colors">
                      <Play className="w-3.5 h-3.5 text-zinc-400 fill-zinc-400" />
                    </div>
                  </button>
                );
              })}

              {/* View all results link */}
              <button
                onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
                className="w-full px-4 py-3 text-center text-sm font-semibold text-fox-orange hover:bg-fox-orange/10 transition-colors border-t border-white/10"
              >
                View all results for "{query}"
              </button>
            </div>
          ) : isLoading && results.length === 0 ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-2 py-2">
                  <Skeleton className="w-12 h-16 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : query.length >= 2 && !isLoading ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-zinc-400">No results found for "{query}"</p>
              <p className="text-xs text-zinc-500 mt-1">Try a different search term</p>
            </div>
          ) : query.length < 2 ? (
            /* Popular searches when typing starts */
            <div className="p-4">
              <div className="flex items-center gap-2 px-1 mb-3">
                <TrendingUp className="w-4 h-4 text-fox-orange" />
                <span className="text-xs font-semibold text-zinc-300">Popular Searches</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {POPULAR_SEARCHES.map(term => (
                  <button
                    key={term}
                    onClick={() => handlePopularClick(term)}
                    className="px-3 py-2 text-xs font-medium text-zinc-300 bg-white/[0.05] hover:bg-fox-orange/15 hover:text-fox-orange hover:border-fox-orange/30 rounded-md transition-colors border border-white/10"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
