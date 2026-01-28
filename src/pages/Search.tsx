import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { AnimeGrid } from '@/components/anime/AnimeGrid';
import { useSearch, useGenre, useTrending } from '@/hooks/useAnime';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search as SearchIcon,
  SlidersHorizontal,
  X,
  ArrowUpDown,
  Loader2,
  Sparkles,
  Filter,
  Grid3X3,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Flame,
  Clock,
  Star,
  Tv
} from 'lucide-react';
import { Anime } from '@/types/anime';
import { cn } from '@/lib/utils';

type SortOption = 'relevance' | 'rating' | 'year' | 'title' | 'episodes';
type TypeFilter = 'all' | 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special';
type StatusFilter = 'all' | 'Ongoing' | 'Completed' | 'Upcoming';

// Common anime genres
const COMMON_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance',
  'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 'Yuri', 'Yaoi',
  'Ecchi', 'Harem', 'Mecha', 'Music', 'Psychological', 'Historical', 'Parody',
  'Samurai', 'Shounen', 'Shoujo', 'Seinen', 'Josei', 'Kids', 'Police', 'Military',
  'School', 'Demons', 'Game', 'Magic', 'Vampire', 'Space', 'Time Travel', 'Martial Arts'
];

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [gridSize, setGridSize] = useState<'compact' | 'normal'>('normal');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Update URL when query changes
  useEffect(() => {
    if (debouncedQuery) {
      setSearchParams({ q: debouncedQuery });
    } else {
      setSearchParams({});
    }
  }, [debouncedQuery, setSearchParams]);

  // Fetch search results or genre results
  const searchQuery = selectedGenres.length > 0 ? selectedGenres[0] : debouncedQuery;
  const isGenreSearch = selectedGenres.length > 0 && !debouncedQuery;
  const hasSearchQuery = debouncedQuery.length >= 2 || selectedGenres.length > 0;
  
  const { data: searchData, isLoading: searchLoading, isFetching: searchFetching } = useSearch(searchQuery, page, undefined, !isGenreSearch && hasSearchQuery);
  const { data: genreData, isLoading: genreLoading, isFetching: genreFetching } = useGenre(searchQuery, page, undefined, isGenreSearch);
  const { data: trendingData, isLoading: trendingLoading } = useTrending(1, undefined);
  
  // Use trending data as default when no search query
  const data = useMemo(() => {
    return hasSearchQuery ? (isGenreSearch ? genreData : searchData) : { results: trendingData || [], totalPages: 1, currentPage: 1, hasNextPage: false };
  }, [hasSearchQuery, isGenreSearch, genreData, searchData, trendingData]);
  const isLoading = hasSearchQuery ? (isGenreSearch ? genreLoading : searchLoading) : trendingLoading;
  const isFetching = hasSearchQuery ? (isGenreSearch ? genreFetching : searchFetching) : false;

  // Filter and sort results
  const filteredResults = useMemo(() => {
    if (!data?.results) return [];

    let results = [...data.results];

    // Apply type filter
    if (typeFilter !== 'all') {
      results = results.filter(anime => anime.type === typeFilter);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      results = results.filter(anime => anime.status === statusFilter);
    }

    // Apply genre filter (only if not using API genre filtering)
    if (selectedGenres.length > 0 && debouncedQuery) {
      results = results.filter(anime => 
        selectedGenres.some(genre => 
          anime.genres.some(animeGenre => 
            animeGenre.toLowerCase() === genre.toLowerCase()
          )
        )
      );
    }
    
    // If this is a pure genre search (no text query), filter by all selected genres
    if (selectedGenres.length > 0 && !debouncedQuery) {
      results = results.filter(anime => 
        selectedGenres.some(genre => 
          anime.genres.some(animeGenre => 
            animeGenre.toLowerCase() === genre.toLowerCase()
          )
        )
      );
    }

    // Apply sorting
    switch (sortBy) {
      case 'rating':
        results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'year':
        results.sort((a, b) => (b.year || 0) - (a.year || 0));
        break;
      case 'title':
        results.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'episodes':
        results.sort((a, b) => (b.episodes || 0) - (a.episodes || 0));
        break;
      default:
        break;
    }

    return results;
  }, [data, typeFilter, statusFilter, sortBy, debouncedQuery, selectedGenres]);

  // Clear all filters
  const clearFilters = () => {
    setTypeFilter('all');
    setStatusFilter('all');
    setSortBy('relevance');
    setSelectedGenres([]);
  };

  const hasActiveFilters = typeFilter !== 'all' || statusFilter !== 'all' || sortBy !== 'relevance' || selectedGenres.length > 0;

  // Quick search suggestions
  const quickSearches = [
    { label: 'Trending', icon: Flame, query: 'popular' },
    { label: 'New', icon: Clock, query: 'new anime 2024' },
    { label: 'Top Rated', icon: Star, query: 'best anime' },
    { label: 'Action', icon: null, query: 'action' },
    { label: 'Romance', icon: null, query: 'romance' },
    { label: 'Fantasy', icon: null, query: 'fantasy' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      {/* Hero Search Section */}
      <div className="relative bg-gradient-to-b from-fox-dark via-fox-dark/50 to-background pt-8 pb-12">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />

        <div className="relative max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl font-black mb-3">
              <span className="text-gradient-orange">Browse</span>
              <span className="text-foreground"> Anime</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Explore popular anime and use filters to find exactly what you want to watch
            </p>
          </div>

          {/* Search Input */}
          <div className="max-w-3xl mx-auto">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-fox-orange via-orange-500 to-fox-orange rounded-2xl opacity-20 group-hover:opacity-40 blur-lg transition-opacity duration-500" />
              <div className="relative flex items-center">
                <SearchIcon className="absolute left-5 w-6 h-6 text-muted-foreground z-10" />
                <Input
                  type="text"
                  placeholder="Search for anime titles, genres, studios..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-14 pr-14 h-16 text-lg bg-fox-surface/80 border-white/10 focus:border-fox-orange/50 rounded-2xl shadow-xl backdrop-blur-xl"
                />
                {query && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setQuery('')}
                    className="absolute right-4 h-10 w-10 rounded-xl hover:bg-white/10"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Professional Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {hasSearchQuery ? 'Search Results' : 'Browse Anime'}
          </h1>
          <p className="text-muted-foreground">
            {hasSearchQuery 
              ? `Found ${data?.results?.length || 0} results`
              : 'Discover new anime to watch'
            }
          </p>
        </div>

        {/* Professional Filters Section */}
        <div className="mb-8 space-y-6">
          {/* Main Filter Controls */}
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant={showFilters ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-2"
              >
                <Filter className="w-4 h-4" />
                Filters
                {(selectedGenres.length > 0 || typeFilter !== 'all' || statusFilter !== 'all') && (
                  <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                    {selectedGenres.length + (typeFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)}
                  </span>
                )}
              </Button>

              {/* Type Filter */}
              <Select value={typeFilter} onValueChange={(value: TypeFilter) => setTypeFilter(value)}>
                <SelectTrigger className="w-32 bg-background/50 border-white/10">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="TV">TV Series</SelectItem>
                  <SelectItem value="Movie">Movies</SelectItem>
                  <SelectItem value="OVA">OVAs</SelectItem>
                  <SelectItem value="ONA">ONAs</SelectItem>
                  <SelectItem value="Special">Specials</SelectItem>
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
                <SelectTrigger className="w-32 bg-background/50 border-white/10">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Ongoing">Ongoing</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Upcoming">Upcoming</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort Filter */}
              <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
                <SelectTrigger className="w-32 bg-background/50 border-white/10">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance">Relevance</SelectItem>
                  <SelectItem value="rating">Rating</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="episodes">Episodes</SelectItem>
                </SelectContent>
              </Select>

              {/* Grid Size Toggle */}
              <div className="flex items-center gap-2">
                <Button
                  variant={gridSize === 'compact' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGridSize('compact')}
                  className="p-2"
                >
                  <Grid3X3 className="w-4 h-4" />
                </Button>
                <Button
                  variant={gridSize === 'normal' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGridSize('normal')}
                  className="p-2"
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Genre Filter Panel */}
          {showFilters && (
            <div className="p-6 bg-background/30 border border-white/10 rounded-xl backdrop-blur-sm">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-white mb-2">Filter by Genres</h3>
                <p className="text-sm text-muted-foreground">Select genres to narrow down your search</p>
              </div>
              
              <div className="flex flex-wrap gap-2 mb-4">
                {COMMON_GENRES.slice(0, 20).map((genre) => (
                  <button
                    key={genre}
                    onClick={() => {
                      setSelectedGenres(prev => 
                        prev.includes(genre) 
                          ? prev.filter(g => g !== genre)
                          : [...prev, genre]
                      );
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                      selectedGenres.includes(genre)
                        ? "bg-primary text-primary-foreground"
                        : "bg-background/50 border border-white/10 hover:bg-background/70"
                    )}
                  >
                    {genre}
                  </button>
                ))}
              </div>

              {/* Clear Filters */}
              {(selectedGenres.length > 0 || typeFilter !== 'all' || statusFilter !== 'all') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedGenres([]);
                    setTypeFilter('all');
                    setStatusFilter('all');
                  }}
                  className="mt-2"
                >
                  Clear All Filters
                </Button>
              )}
            </div>
          )}

          {/* Active Filters Display */}
          {(selectedGenres.length > 0 || typeFilter !== 'all' || statusFilter !== 'all') && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {selectedGenres.map(genre => (
                <Badge key={genre} variant="secondary" className="gap-1">
                  {genre}
                  <button
                    onClick={() => setSelectedGenres(prev => prev.filter(g => g !== genre))}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {typeFilter !== 'all' && (
                <Badge variant="secondary" className="gap-1">
                  Type: {typeFilter}
                  <button
                    onClick={() => setTypeFilter('all')}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {statusFilter !== 'all' && (
                <Badge variant="secondary" className="gap-1">
                  Status: {statusFilter}
                  <button
                    onClick={() => setStatusFilter('all')}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Browse Results */}
        {!debouncedQuery ? (
          // Popular anime browsing
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-3">Popular Anime</h2>
              <p className="text-muted-foreground max-w-md text-lg">
                Browse trending anime or use filters and search to find exactly what you're looking for.
              </p>
            </div>
            <AnimeGrid anime={filteredResults} columns={gridSize === 'compact' ? 8 : 6} />
          </div>
        ) : debouncedQuery.length < 2 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-fox-surface/50 flex items-center justify-center mx-auto mb-4">
              <SearchIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-lg">
              Type at least 2 characters to search
            </p>
          </div>
        ) : isLoading ? (
          // Loading state
          <div className={cn(
            "grid gap-5",
            gridSize === 'compact'
              ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8"
              : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          )}>
            {[...Array(18)].map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[2/3] rounded-xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredResults.length === 0 ? (
          // No results
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-24 h-24 rounded-3xl bg-fox-surface/50 flex items-center justify-center mb-8">
              <SearchIcon className="w-12 h-12 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-3">No Results Found</h2>
            <p className="text-muted-foreground max-w-md text-lg mb-6">
              We couldn't find any anime matching "<span className="text-foreground font-medium">{debouncedQuery}</span>".
              Try a different search term or adjust your filters.
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                onClick={clearFilters}
                className="rounded-xl h-11 px-6"
              >
                <X className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          // Results grid
          <>
            <AnimeGrid
              anime={filteredResults}
              columns={gridSize === 'compact' ? 8 : 6}
            />

            {/* Pagination */}
            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-12">
                <Button
                  variant="outline"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || isFetching}
                  className="h-12 px-6 rounded-xl gap-2"
                >
                  <ChevronLeft className="w-5 h-5" />
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {Array.from({ length: Math.min(5, data.totalPages) }).map((_, i) => {
                    let pageNum: number;
                    if (data.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= data.totalPages - 2) {
                      pageNum = data.totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={cn(
                          "w-10 h-10 rounded-xl font-medium transition-all",
                          pageNum === page
                            ? "bg-fox-orange text-white shadow-lg shadow-fox-orange/30"
                            : "bg-fox-surface/50 hover:bg-fox-surface"
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!data.hasNextPage || isFetching}
                  className="h-12 px-6 rounded-xl gap-2"
                >
                  Next
                  {isFetching ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ChevronRight className="w-5 h-5" />
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Search;
