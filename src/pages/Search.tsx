import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { AnimeGrid } from '@/components/anime/AnimeGrid';
import { useSearch, useGenre, useBrowse } from '@/hooks/useAnime';
import { useQueryClient } from '@tanstack/react-query';
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
  X,
  Loader2,
  Filter,
  Grid3X3,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Flame,
  Clock,
  TrendingUp,
  Shuffle,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Scroll restoration key storage
const SCROLL_POSITIONS_KEY = 'anistream_scroll_positions';
const FILTER_STATE_KEY = 'anistream_filter_state';

// Save scroll position for a given key
const saveScrollPosition = (key: string, position: number) => {
  try {
    const positions = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || '{}');
    positions[key] = position;
    sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
  } catch (e) {
    // Ignore storage errors
  }
};

// Get scroll position for a given key
const getScrollPosition = (key: string): number => {
  try {
    const positions = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || '{}');
    return positions[key] || 0;
  } catch (e) {
    return 0;
  }
};

// Sort options for search results (when searching)
type SearchSortOption = 'relevance' | 'rating' | 'year' | 'title' | 'episodes';
// Sort options for browsing (when not searching)
type BrowseSortOption = 'popularity' | 'trending' | 'recently_released' | 'shuffle';
type TypeFilter = 'all' | 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special';
type StatusFilter = 'all' | 'Ongoing' | 'Completed' | 'Upcoming';

// Comprehensive anime genres from HiAnime
const COMMON_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance',
  'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 'Yuri', 'Yaoi',
  'Ecchi', 'Harem', 'Mecha', 'Music', 'Psychological', 'Historical', 'Parody',
  'Samurai', 'Shounen', 'Shoujo', 'Seinen', 'Josei', 'Kids', 'Police', 'Military',
  'School', 'Demons', 'Game', 'Magic', 'Vampire', 'Space', 'Martial Arts',
  'Isekai', 'Gore', 'Survival', 'Cyberpunk', 'Super Power', 'Mythology',
  'Work Life', 'Adult Cast', 'Anthropomorphic', 'CGDCT', 'Childcare', 'Combat Sports',
  'Crossdressing', 'Delinquents', 'Detective', 'Educational', 'Gag Humor', 'Gender Bender',
  'High Stakes Game', 'Idols (Female)', 'Idols (Male)', 'Iyashikei',
  'Love Polygon', 'Magical Sex Shift', 'Mahou Shoujo', 'Medical', 'Memoir',
  'Organized Crime', 'Otaku Culture', 'Performing Arts', 'Pets', 'Reincarnation', 'Reverse Harem',
  'Romantic Subtext', 'Showbiz', 'Strategy Game', 'Team Sports', 'Time Travel',
  'Video Game', 'Visual Arts', 'Workplace'
];

// Year ranges for date filter
const currentYear = new Date().getFullYear();
const YEAR_RANGES = [
  { label: 'All Time', startYear: undefined, endYear: undefined },
  { label: `${currentYear}`, startYear: currentYear, endYear: currentYear },
  { label: `${currentYear - 1}`, startYear: currentYear - 1, endYear: currentYear - 1 },
  { label: '2020s', startYear: 2020, endYear: currentYear },
  { label: '2010s', startYear: 2010, endYear: 2019 },
  { label: '2000s', startYear: 2000, endYear: 2009 },
  { label: '90s', startYear: 1990, endYear: 1999 },
  { label: '80s & Earlier', startYear: 1960, endYear: 1989 },
];

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  
  // Create a unique key for this filter state
  const filterStateKey = location.pathname + '?' + Array.from(searchParams.entries()).map(([k, v]) => `${k}=${v}`).join('&');
  
  // Initialize state from URL params
  const initialQuery = searchParams.get('q') || '';
  const initialGenres = searchParams.get('genres')?.split(',').filter(Boolean) || [];
  const initialType = (searchParams.get('type') as TypeFilter) || 'all';
  const initialStatus = (searchParams.get('status') as StatusFilter) || 'all';
  const initialYear = parseInt(searchParams.get('year') || '0', 10);
  const initialSort = (searchParams.get('sort') as BrowseSortOption) || 'popularity';
  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  const [searchSortBy, setSearchSortBy] = useState<SearchSortOption>('relevance');
  const [browseSortBy, setBrowseSortBy] = useState<BrowseSortOption>(initialSort);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialType);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(initialGenres);
  const [selectedYearRange, setSelectedYearRange] = useState<number>(initialYear);
  const [showFilters, setShowFilters] = useState(false);
  const [gridSize, setGridSize] = useState<'compact' | 'normal'>('normal');
  
  // Scroll restoration on mount
  useEffect(() => {
    const savedPosition = getScrollPosition(filterStateKey);
    if (savedPosition > 0) {
      window.scrollTo(0, savedPosition);
    }
  }, [filterStateKey]);
  
  // Save scroll position on unmount/navigation
  useEffect(() => {
    const handleScroll = () => {
      saveScrollPosition(filterStateKey, window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      saveScrollPosition(filterStateKey, window.scrollY);
    };
  }, [filterStateKey]);
  
  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  
  // Update URL when filters change (preserves state on back button)
  useEffect(() => {
    const params: Record<string, string> = {};
    if (debouncedQuery) params.q = debouncedQuery;
    if (selectedGenres.length > 0) params.genres = selectedGenres.join(',');
    if (typeFilter !== 'all') params.type = typeFilter;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (selectedYearRange > 0) params.year = selectedYearRange.toString();
    if (browseSortBy !== 'popularity') params.sort = browseSortBy;
    if (page > 1) params.page = page.toString();
    
    setSearchParams(params);
  }, [debouncedQuery, selectedGenres, typeFilter, statusFilter, selectedYearRange, browseSortBy, page, setSearchParams]);

  // Build browse filters for the API
  const browseFilters = useMemo(() => {
    const yearRange = YEAR_RANGES[selectedYearRange];
    return {
      type: typeFilter !== 'all' ? typeFilter : undefined,
      genre: selectedGenres.length > 0 ? selectedGenres.join(',') : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      startYear: yearRange.startYear,
      endYear: yearRange.endYear,
      sort: browseSortBy,
    };
  }, [typeFilter, selectedGenres, statusFilter, selectedYearRange, browseSortBy]);

  // Track if we need to bypass cache (for shuffle)
  const [shuffleBypass, setShuffleBypass] = useState(0);

  // Use browse API for browsing (50 per page, with filters and sorting)
  const { data: browseData, isLoading: browseLoading, isFetching: browseFetching } = useBrowse(
    browseFilters,
    page,
    !debouncedQuery, // Only enable browse when not searching
    shuffleBypass > 0 // Bypass cache when shuffleBypass is set
  );

  // Use search API when there's a search query
  const hasSearchQuery = debouncedQuery.length >= 2;
  const { data: searchData, isLoading: searchLoading, isFetching: searchFetching } = useSearch(
    debouncedQuery,
    page,
    undefined,
    hasSearchQuery
  );

  // Get data based on mode
  const data = useMemo(() => {
    if (hasSearchQuery) {
      return {
        results: searchData?.results || [],
        totalPages: searchData?.totalPages || 1,
        currentPage: searchData?.currentPage || 1,
        hasNextPage: searchData?.hasNextPage || false,
        totalResults: searchData?.totalResults || searchData?.results?.length || 0
      };
    } else {
      return {
        results: browseData?.results || [],
        totalPages: browseData?.totalPages || 1,
        currentPage: browseData?.currentPage || page,
        hasNextPage: browseData?.hasNextPage || false,
        totalResults: browseData?.totalResults || browseData?.results?.length || 0
      };
    }
  }, [hasSearchQuery, searchData, browseData, page]);

  const isLoading = hasSearchQuery ? searchLoading : browseLoading;
  const isFetching = hasSearchQuery ? searchFetching : browseFetching;

  // Filter and sort results for search mode only
  // Browse mode uses server-side filtering/sorting
  const filteredResults = useMemo(() => {
    if (!data?.results) return [];

    // If browsing (not searching), data is already filtered/sorted by API
    if (!hasSearchQuery) {
      return data.results;
    }

    // For search results, apply client-side filtering and sorting
    const results = [...data.results];

    // Apply sorting for search results
    switch (searchSortBy) {
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
  }, [data, hasSearchQuery, searchSortBy]);

  // Clear all filters
  const clearFilters = () => {
    setTypeFilter('all');
    setStatusFilter('all');
    setBrowseSortBy('popularity');
    setSearchSortBy('relevance');
    setSelectedGenres([]);
    setSelectedYearRange(0);
    setPage(1);
  };

  // Handle shuffle button
  const handleShuffle = () => {
    // Always shuffle the current results, whether already in shuffle mode or not
    setBrowseSortBy('shuffle');
    setPage(1);
    // Increment bypass counter to force a new API call with fresh timestamp
    // This ensures different random results every time the button is clicked
    setShuffleBypass(prev => prev + 1);
  };

  const hasActiveFilters = typeFilter !== 'all' || statusFilter !== 'all' ||
    selectedGenres.length > 0 || selectedYearRange !== 0 || browseSortBy !== 'popularity';

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
          {/* Main Filter Controls - Compact with better wrapping */}
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-center justify-between">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
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

              {/* Type Filter - Compact */}
              <Select value={typeFilter} onValueChange={(value: TypeFilter) => setTypeFilter(value)}>
                <SelectTrigger className="w-28 bg-background/50 border-white/10 h-9">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="TV">TV</SelectItem>
                  <SelectItem value="Movie">Movie</SelectItem>
                  <SelectItem value="OVA">OVA</SelectItem>
                  <SelectItem value="ONA">ONA</SelectItem>
                  <SelectItem value="Special">Special</SelectItem>
                </SelectContent>
              </Select>

              {/* Status Filter - Compact */}
              <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
                <SelectTrigger className="w-28 bg-background/50 border-white/10 h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Ongoing">Ongoing</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Upcoming">Upcoming</SelectItem>
                </SelectContent>
              </Select>

              {/* Date Filter - Compact */}
              <Select
                value={String(selectedYearRange)}
                onValueChange={(value) => {
                  setSelectedYearRange(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-28 bg-background/50 border-white/10 h-9">
                  <Calendar className="w-3.5 h-3.5 mr-1.5" />
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_RANGES.map((range, index) => (
                    <SelectItem key={index} value={String(index)}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Sort Options - Browse Mode - Compact Icon Buttons */}
              {!debouncedQuery && (
                <div className="flex items-center gap-1">
                  <Button
                    variant={browseSortBy === 'popularity' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => { setBrowseSortBy('popularity'); setPage(1); }}
                    className={cn(
                      "p-2 transition-all",
                      browseSortBy === 'popularity' ? "" : "text-muted-foreground hover:text-foreground"
                    )}
                    title="Popular"
                  >
                    <Flame className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={browseSortBy === 'trending' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => { setBrowseSortBy('trending'); setPage(1); }}
                    className={cn(
                      "p-2 transition-all",
                      browseSortBy === 'trending' ? "" : "text-muted-foreground hover:text-foreground"
                    )}
                    title="Trending"
                  >
                    <TrendingUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={browseSortBy === 'recently_released' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => { setBrowseSortBy('recently_released'); setPage(1); }}
                    className={cn(
                      "p-2 transition-all",
                      browseSortBy === 'recently_released' ? "" : "text-muted-foreground hover:text-foreground"
                    )}
                    title="New Releases"
                  >
                    <Clock className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={browseSortBy === 'shuffle' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={handleShuffle}
                    className={cn(
                      "p-2 transition-all",
                      browseSortBy === 'shuffle' ? "" : "text-muted-foreground hover:text-foreground"
                    )}
                    title="Shuffle - Get Random Anime"
                  >
                    <Shuffle className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Sort Options - Search Mode */}
              {debouncedQuery && (
                <Select value={searchSortBy} onValueChange={(value: SearchSortOption) => setSearchSortBy(value)}>
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
              )}

              {/* Grid Size Toggle - Compact Icon Buttons */}
              <div className="flex items-center gap-1">
                <Button
                  variant={gridSize === 'compact' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setGridSize('compact')}
                  className={cn(
                    "p-2 transition-all",
                    gridSize === 'compact' ? "" : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Compact Grid"
                >
                  <Grid3X3 className="w-4 h-4" />
                </Button>
                <Button
                  variant={gridSize === 'normal' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setGridSize('normal')}
                  className={cn(
                    "p-2 transition-all",
                    gridSize === 'normal' ? "" : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Normal Grid"
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

              <div className="flex flex-wrap gap-2 mb-4 max-h-48 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                {COMMON_GENRES.map((genre) => (
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
          <div className="space-y-8">
            {/* Loading State */}
            {isLoading ? (
              <div className={cn(
                "grid gap-5",
                gridSize === 'compact'
                  ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8"
                  : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
              )}>
                {[...Array(25)].map((_, i) => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="aspect-[2/3] rounded-xl" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredResults.length === 0 ? (
              /* Empty State */
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-24 h-24 rounded-3xl bg-fox-surface/50 flex items-center justify-center mb-8">
                  <Filter className="w-12 h-12 text-muted-foreground" />
                </div>
                <h2 className="text-2xl font-bold mb-3">No Anime Found</h2>
                <p className="text-muted-foreground max-w-md text-lg mb-6">
                  No anime matches your current filters. Try adjusting your filter criteria.
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
              /* Results Grid with Pagination */
              <>
                <AnimeGrid
                  anime={filteredResults}
                  columns={gridSize === 'compact' ? 8 : 6}
                />

                {/* Pagination Controls */}
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

                {/* Results count */}
                <div className="text-center text-muted-foreground text-sm mt-4">
                  Showing {filteredResults.length} of {data?.totalResults || filteredResults.length} anime
                </div>
              </>
            )}
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
