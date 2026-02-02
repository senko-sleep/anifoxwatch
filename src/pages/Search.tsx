import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { AnimeGrid } from '@/components/anime/AnimeGrid';
import { useSearch, useBrowse } from '@/hooks/useAnime';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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
  Calendar,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Scroll restoration key storage
const SCROLL_POSITIONS_KEY = 'anistream_scroll_positions';

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
  { label: `${currentYear} `, startYear: currentYear, endYear: currentYear },
  { label: `${currentYear - 1} `, startYear: currentYear - 1, endYear: currentYear - 1 },
  { label: '2020s', startYear: 2020, endYear: currentYear },
  { label: '2010s', startYear: 2010, endYear: 2019 },
  { label: '2000s', startYear: 2000, endYear: 2009 },
  { label: '90s', startYear: 1990, endYear: 1999 },
  { label: '80s & Earlier', startYear: 1960, endYear: 1989 },
];

const FilterSection = ({
  title,
  children,
  className
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("space-y-3", className)}>
    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
    {children}
  </div>
);

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Create a unique key for this filter state
  const filterStateKey = location.pathname + '?' + Array.from(searchParams.entries()).map(([k, v]) => `${k}=${v} `).join('&');

  // Initialize state from URL params
  const initialQuery = searchParams.get('q') || '';
  const initialGenres = searchParams.get('genres')?.split(',').filter(Boolean) || [];
  const initialType = (searchParams.get('type') as TypeFilter) || 'all';
  const initialStatus = (searchParams.get('status') as StatusFilter) || 'all';
  const initialYear = parseInt(searchParams.get('year') || '0', 10);
  const initialSort = (searchParams.get('sort') as BrowseSortOption) || 'popularity';
  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  const initialMode = (searchParams.get('mode') as 'safe' | 'mixed' | 'adult') || 'safe';

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  const [searchSortBy, setSearchSortBy] = useState<SearchSortOption>('relevance');
  const [browseSortBy, setBrowseSortBy] = useState<BrowseSortOption>(initialSort);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialType);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(initialGenres);
  const [selectedYearRange, setSelectedYearRange] = useState<number>(initialYear);
  const [gridSize, setGridSize] = useState<'compact' | 'normal'>('normal');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [mode, setMode] = useState<'safe' | 'mixed' | 'adult'>(initialMode);

  // Use ref to track if we're currently updating from URL (to avoid infinite loops)
  const isUpdatingFromUrl = useRef(false);

  // Sync state with URL params when they change (e.g., after navigating back from watch page)
  useEffect(() => {
    // Skip if we're in the middle of updating from URL
    if (isUpdatingFromUrl.current) return;

    const urlPage = parseInt(searchParams.get('page') || '1', 10);
    const urlType = (searchParams.get('type') as TypeFilter) || 'all';
    const urlStatus = (searchParams.get('status') as StatusFilter) || 'all';
    const urlYear = parseInt(searchParams.get('year') || '0', 10);
    const urlSort = (searchParams.get('sort') as BrowseSortOption) || 'popularity';
    const urlMode = (searchParams.get('mode') as 'safe' | 'mixed' | 'adult') || 'safe';
    const urlGenres = searchParams.get('genres')?.split(',').filter(Boolean) || searchParams.get('genre')?.split(',').filter(Boolean) || [];

    // Check if any values differ
    const needsPageSync = urlPage !== page;
    const needsTypeSync = urlType !== typeFilter;
    const needsStatusSync = urlStatus !== statusFilter;
    const needsYearSync = urlYear !== selectedYearRange;
    const needsSortSync = urlSort !== browseSortBy;
    const needsModeSync = urlMode !== mode;
    const currentGenresStr = selectedGenres.sort().join(',');
    const urlGenresStr = urlGenres.sort().join(',');
    const needsGenresSync = currentGenresStr !== urlGenresStr;

    if (needsPageSync || needsTypeSync || needsStatusSync || needsYearSync || needsSortSync || needsModeSync || needsGenresSync) {
      isUpdatingFromUrl.current = true;

      // Batch update all state values
      if (needsPageSync) setPage(urlPage);
      if (needsTypeSync) setTypeFilter(urlType);
      if (needsStatusSync) setStatusFilter(urlStatus);
      if (needsYearSync) setSelectedYearRange(urlYear);
      if (needsSortSync) setBrowseSortBy(urlSort);
      if (needsModeSync) setMode(urlMode);
      if (needsGenresSync) setSelectedGenres(urlGenres);

      // Reset ref after state updates complete
      setTimeout(() => {
        isUpdatingFromUrl.current = false;
      }, 0);
    }
  }, [searchParams]);

  // Restore scroll position
  useEffect(() => {
    try {
      const positions = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || '{}');
      if (positions[filterStateKey] > 0) {
        window.scrollTo(0, positions[filterStateKey]);
      }
    } catch (e) { /* ignore */ }
  }, [filterStateKey]);

  // Save scroll position
  useEffect(() => {
    const handleScroll = () => {
      try {
        const positions = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || '{}');
        positions[filterStateKey] = window.scrollY;
        sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
      } catch (e) { /* ignore */ }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [filterStateKey]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 500); // Slightly longer debounce for better performance
    return () => clearTimeout(timer);
  }, [query]);

  // Update URL params
  useEffect(() => {
    const params: Record<string, string> = {};
    if (debouncedQuery) params.q = debouncedQuery;
    if (selectedGenres.length > 0) params.genres = selectedGenres.join(',');
    if (typeFilter !== 'all') params.type = typeFilter;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (selectedYearRange > 0) params.year = selectedYearRange.toString();
    if (browseSortBy !== 'popularity') params.sort = browseSortBy;
    if (page > 1) params.page = page.toString();
    if (mode !== 'safe') params.mode = mode;
    setSearchParams(params, { replace: true });
  }, [debouncedQuery, selectedGenres, typeFilter, statusFilter, selectedYearRange, browseSortBy, page, mode, setSearchParams]);

  // Build filters
  const browseFilters = useMemo(() => ({
    type: typeFilter !== 'all' ? typeFilter : undefined,
    genre: selectedGenres.length > 0 ? selectedGenres.join(',') : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    startYear: YEAR_RANGES[selectedYearRange].startYear,
    endYear: YEAR_RANGES[selectedYearRange].endYear,
    sort: browseSortBy,
    mode: mode,
  }), [typeFilter, selectedGenres, statusFilter, selectedYearRange, browseSortBy, mode]);

  // Cache bypass for shuffle
  const [shuffleBypass, setShuffleBypass] = useState(0);

  // Queries
  const hasSearchQuery = debouncedQuery.length >= 2;

  const {
    data: browseData,
    isLoading: browseLoading,
    isFetching: browseFetching,
    error: browseError
  } = useBrowse(
    browseFilters,
    page,
    !hasSearchQuery,
    shuffleBypass > 0
  );

  const {
    data: searchData,
    isLoading: searchLoading,
    isFetching: searchFetching,
    error: searchError
  } = useSearch(
    debouncedQuery,
    page,
    undefined,
    hasSearchQuery,
    mode
  );

  const isLoading = hasSearchQuery ? searchLoading : browseLoading;
  const isFetching = hasSearchQuery ? searchFetching : browseFetching;
  const error = hasSearchQuery ? searchError : browseError;

  // Process data
  const processedData = useMemo(() => {
    const rawData = hasSearchQuery ? searchData : browseData;
    if (!rawData) return { results: [], totalPages: 0, totalResults: 0, hasNextPage: false };

    let results = [...(rawData.results || [])];

    // Client-side sort for search results only
    if (hasSearchQuery) {
      switch (searchSortBy) {
        case 'rating': results.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
        case 'year': results.sort((a, b) => (b.year || 0) - (a.year || 0)); break;
        case 'title': results.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break;
        case 'episodes': results.sort((a, b) => (b.episodes || 0) - (a.episodes || 0)); break;
      }
    }

    return {
      results,
      totalPages: rawData.totalPages || 1,
      totalResults: rawData.totalResults || rawData.results?.length || 0,
      hasNextPage: rawData.hasNextPage || false
    };
  }, [hasSearchQuery, searchData, browseData, searchSortBy]);

  // Actions
  const clearFilters = () => {
    setTypeFilter('all');
    setStatusFilter('all');
    setBrowseSortBy('popularity');
    setSearchSortBy('relevance');
    setSelectedGenres([]);
    setSelectedYearRange(0);
    setPage(1);
    setQuery(''); // Also clear query
    setMode('safe');
  };

  const handleShuffle = () => {
    setBrowseSortBy('shuffle');
    setPage(1);
    setShuffleBypass(prev => prev + 1);
  };

  const FiltersContent = () => (
    <div className="space-y-8 p-1">
      <FilterSection title="Status">
        <Select value={statusFilter} onValueChange={(v: StatusFilter) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full bg-secondary/50 border-white/10">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Ongoing">Ongoing</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Upcoming">Upcoming</SelectItem>
          </SelectContent>
        </Select>
      </FilterSection>

      <FilterSection title="Format">
        <div className="grid grid-cols-2 gap-2">
          {['TV', 'Movie', 'OVA', 'ONA', 'Special'].map((t) => (
            <Button
              key={t}
              variant={typeFilter === t ? "default" : "outline"}
              size="sm"
              onClick={() => { setTypeFilter(typeFilter === t ? 'all' : t as TypeFilter); setPage(1); }}
              className={cn("w-full justify-start", typeFilter === t ? "bg-fox-orange hover:bg-fox-orange/90" : "bg-transparent")}
            >
              {t}
            </Button>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Release Year">
        <Select value={String(selectedYearRange)} onValueChange={(v) => { setSelectedYearRange(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-full bg-secondary/50 border-white/10">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {YEAR_RANGES.map((range, i) => (
              <SelectItem key={i} value={String(i)}>{range.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterSection>

      <FilterSection title="Content Settings">
        <Select value={mode} onValueChange={(v: 'safe' | 'mixed' | 'adult') => { setMode(v); setPage(1); }}>
          <SelectTrigger className="w-full bg-secondary/50 border-white/10">
            <SelectValue placeholder="Content Visibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="safe">Safe Only (Default)</SelectItem>
            <SelectItem value="mixed">Mixed Content</SelectItem>
            <SelectItem value="adult">+18 Only</SelectItem>
          </SelectContent>
        </Select>
      </FilterSection>

      <FilterSection title="Genres">
        <ScrollArea className="h-[300px] pr-4">
          <div className="flex flex-wrap gap-2">
            {COMMON_GENRES.map((g) => (
              <Badge
                key={g}
                variant={selectedGenres.includes(g) ? "default" : "outline"}
                className={cn(
                  "cursor-pointer hover:bg-secondary/80 transition-colors",
                  selectedGenres.includes(g) ? "bg-fox-orange text-white hover:bg-fox-orange/90 border-transparent" : "text-muted-foreground"
                )}
                onClick={() => {
                  setSelectedGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
                  setPage(1);
                }}
              >
                {g}
              </Badge>
            ))}
          </div>
        </ScrollArea>
      </FilterSection>

      <Button variant="outline" className="w-full" onClick={clearFilters}>
        <X className="w-4 h-4 mr-2" />
        Reset All and Search
      </Button>
    </div >
  );

  return (
    <div className="min-h-screen bg-background font-sans text-foreground flex flex-col">
      <Navbar />

      {/* Search Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-white/5 py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex gap-4 items-center">
          <div className="relative flex-1 max-w-2xl">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search anime..."
              className="pl-12 h-12 bg-secondary/50 border-white/10 rounded-xl text-lg focus:ring-fox-orange/50 transition-all font-medium"
            />
            {query && (
              <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setQuery('')}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Sheet open={isMobileFiltersOpen} onOpenChange={setIsMobileFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="lg" className="lg:hidden gap-2 h-12 rounded-xl">
                  <Filter className="w-5 h-5" />
                  Filters
                  {(selectedGenres.length > 0 || typeFilter !== 'all' || statusFilter !== 'all' || mode !== 'safe') && (
                    <Badge variant="secondary" className="ml-1 px-1.5 h-5 min-w-[1.25rem] flex items-center justify-center">
                      {selectedGenres.length + (typeFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (mode !== 'safe' ? 1 : 0)}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] sm:w-[400px] overflow-y-auto">
                <SheetHeader className="mb-6">
                  <SheetTitle>Filter Anime</SheetTitle>
                  <SheetDescription>Narrow down results by genre, status, and more.</SheetDescription>
                </SheetHeader>
                <FiltersContent />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex items-start gap-8">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-72 shrink-0 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2 pb-10 scrollbar-none">
          <div className="mb-6">
            <h2 className="text-xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent mb-1">Filters</h2>
            <p className="text-sm text-muted-foreground">Find your next favorite.</p>
          </div>
          <FiltersContent />
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* Active Filters & Controls */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold">
                {hasSearchQuery ? `Search Results for "${debouncedQuery}"` : 'Browse Anime'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isLoading ? 'Searching...' : `Found ${processedData.totalResults} results`}
              </p>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              {!hasSearchQuery && (
                <div className="flex bg-secondary/30 rounded-lg p-1 border border-white/5">
                  {[
                    { id: 'popularity', icon: Flame, tooltip: 'Popular' },
                    { id: 'trending', icon: TrendingUp, tooltip: 'Trending' },
                    { id: 'recently_released', icon: Clock, tooltip: 'Newest' },
                    { id: 'shuffle', icon: Shuffle, tooltip: 'Random' }
                  ].map((opt) => (
                    <Button
                      key={opt.id}
                      variant={browseSortBy === opt.id ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={opt.id === 'shuffle' ? handleShuffle : () => { setBrowseSortBy(opt.id as BrowseSortOption); setPage(1); }}
                      className={cn("h-8 w-8 px-0 rounded-md", browseSortBy === opt.id && "bg-background text-fox-orange shadow-sm")}
                      title={opt.tooltip}
                    >
                      <opt.icon className="w-4 h-4" />
                    </Button>
                  ))}
                </div>
              )}

              {hasSearchQuery && (
                <Select value={searchSortBy} onValueChange={(v: SearchSortOption) => setSearchSortBy(v)}>
                  <SelectTrigger className="w-32 h-9 text-xs">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">Relevance</SelectItem>
                    <SelectItem value="rating">Rating</SelectItem>
                    <SelectItem value="year">Newest</SelectItem>
                  </SelectContent>
                </Select>
              )}

              <div className="flex bg-secondary/30 rounded-lg p-1 border border-white/5">
                <Button
                  variant={gridSize === 'compact' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setGridSize('compact')}
                  className={cn("h-8 w-8 px-0 rounded-md", gridSize === 'compact' && "bg-background text-fox-orange shadow-sm")}
                >
                  <Grid3X3 className="w-4 h-4" />
                </Button>
                <Button
                  variant={gridSize === 'normal' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setGridSize('normal')}
                  className={cn("h-8 w-8 px-0 rounded-md", gridSize === 'normal' && "bg-background text-fox-orange shadow-sm")}
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive" className="mb-6 bg-destructive/10 border-destructive/20 text-destructive-foreground">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error.message || 'Something went wrong while fetching anime.'}</AlertDescription>
            </Alert>
          )}

          {/* Loading or Results */}
          {isLoading ? (
            <div className={cn(
              "grid gap-4",
              gridSize === 'compact'
                ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6"
                : "grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4"
            )}>
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : processedData.results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-white/5 rounded-2xl bg-secondary/5">
              <div className="bg-secondary/50 p-4 rounded-full mb-4">
                <SearchIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold mb-2">No results found</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                We couldn't find any anime that matches your filters. Try adjusting your search query or filters.
              </p>
              <Button onClick={clearFilters}>Clear Filters</Button>
            </div>
          ) : (
            <>
              <AnimeGrid
                anime={processedData.results}
                columns={gridSize === 'compact' ? 6 : 4}
              />

              {/* Pagination */}
              {processedData.totalPages > 1 && (
                <div className="mt-12 flex justify-center items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || isFetching}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>

                  <span className="text-sm font-medium mx-4">
                    Page {page} of {processedData.totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPage(p => p + 1)}
                    disabled={!processedData.hasNextPage || isFetching}
                  >
                    {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  </Button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default Search;
