import React, { useState, useEffect, useMemo, useRef } from 'react';
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

// Genre lists for different content modes
const SAFE_GENRES = [
  'Action', 'Adventure', 'Cars', 'Comedy', 'Dementia', 'Demons', 'Drama',
  'Fantasy', 'Game', 'Harem', 'Historical', 'Horror', 'Isekai', 'Josei', 'Kids',
  'Magic', 'Martial Arts', 'Mecha', 'Military', 'Music', 'Mystery', 'Parody',
  'Police', 'Psychological', 'Romance', 'Samurai', 'School', 'Sci-Fi', 'Seinen',
  'Shoujo', 'Shounen', 'Slice of Life', 'Space',
  'Sports', 'Super Power', 'Supernatural', 'Thriller', 'Vampire'
];

const ADULT_GENRES = [
  // Core adult genres
  'Hentai', 'Ecchi', 'Yaoi', 'Yuri',

  // WatchHentai specific genres (formatted for display)
  '3D', 'Ahegao', 'Anal', 'Animal Ears', 'BDSM', 'Beastiality', 'Big Boobs',
  'Blackmail', 'Blowjob', 'Bondage', 'Brainwashed', 'Bukakke', 'Cat Girl',
  'Censored', 'Cosplay', 'Creampie', 'Dark Skin', 'Deepthroat', 'Double Penetration',
  'Facesitting', 'Facial', 'Femdom', 'Footjob', 'Futanari', 'Gangbang',
  'Gyaru', 'Horny Slut', 'Housewife', 'Humiliation', 'Incest', 'Inflation',
  'Internal Cumshot', 'Lactation', 'Large Breasts', 'Lolicon', 'Magical Girls',
  'Maid', 'Megane', 'MILF', 'Mind Break', 'Molestation', 'NTR', 'Nuns', 'Nurses',
  'Office Ladies', 'POV', 'Pregnant', 'Princess', 'Public Sex', 'Rape',
  'Rim Job', 'Scat', 'School Girls', 'Shimapan', 'Shoutacon', 'Slaves',
  'Squirting', 'Stocking', 'Strap On', 'Strapped On', 'Succubus', 'Swimsuit',
  'Tentacles', 'Three Some', 'Tits Fuck', 'Torture', 'Toys', 'Train Molestation',
  'Tsundere', 'Uncensored', 'Urination', 'Vanilla', 'Virgins', 'Widow', 'X-Ray',

  // Shared genres that appear in both
  'Female Doctor', 'Female Teacher'
];

const MIXED_GENRES = [...SAFE_GENRES, ...ADULT_GENRES].sort();

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
  className,
  collapsible = false,
  defaultOpen = true
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  
  return (
    <div className={cn("space-y-3", className)}>
      <button 
        onClick={() => collapsible && setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-between w-full text-left",
          collapsible && "cursor-pointer hover:text-fox-orange transition-colors"
        )}
      >
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
        {collapsible && (
          <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
        )}
      </button>
      {(!collapsible || isOpen) && children}
    </div>
  );
};

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Create a unique key for this filter state to store scroll position
  const filterStateKey = useMemo(() => {
    const params = Array.from(searchParams.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return `${location.pathname}?${params}`;
  }, [location.pathname, searchParams]);

  // Initialize state from URL params
  const initialQuery = searchParams.get('q') || '';
  const initialGenres = searchParams.get('genres')?.split(',').filter(Boolean) || searchParams.get('genre')?.split(',').filter(Boolean) || [];
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
  const [jumpPage, setJumpPage] = useState("");

  // Use ref to track if we're currently updating from URL (to avoid infinite loops)
  const isUpdatingFromUrl = useRef(false);
  const isFirstMount = useRef(true);
  const scrollRestored = useRef(false);

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

    // Filter genres based on mode
    let validUrlGenres = urlGenres;
    if (urlMode === 'safe') {
      validUrlGenres = urlGenres.filter(genre => SAFE_GENRES.includes(genre));
    } else if (urlMode === 'adult') {
      validUrlGenres = urlGenres.filter(genre => ADULT_GENRES.includes(genre));
    }

    const currentGenresStr = selectedGenres.sort().join(',');
    const urlGenresStr = validUrlGenres.sort().join(',');
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
      if (needsGenresSync) setSelectedGenres(validUrlGenres);

      // Reset ref after state updates complete
      setTimeout(() => {
        isUpdatingFromUrl.current = false;
      }, 0);
    }
  }, [searchParams]);

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
      // Only update if query changed
      if (query !== debouncedQuery) {
        setDebouncedQuery(query);
        // Only reset page if it's not the first mount or if the query actually changed later
        if (!isFirstMount.current) {
          setPage(1);
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query, debouncedQuery]);

  // Handle first mount flag
  useEffect(() => {
    // Set a small timeout to allow initial state to stabilize
    const timer = setTimeout(() => {
      isFirstMount.current = false;
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Scroll to top on page change (skip on first mount to allow scroll restoration)
  useEffect(() => {
    if (isFirstMount.current) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

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

    const newSearch = new URLSearchParams(params).toString();
    const fullUrl = `${location.pathname}${newSearch ? `?${newSearch}` : ''}`;

    // Save current browse URL as last browse URL for the watch page back button
    sessionStorage.setItem('last_browse_url', fullUrl);

    setSearchParams(params, { replace: true });
  }, [debouncedQuery, selectedGenres, typeFilter, statusFilter, selectedYearRange, browseSortBy, page, mode, setSearchParams, location.pathname]);

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

  // Deduplicate results by normalizing titles
  const normalizeTitle = (title: string): string => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/season\d+/g, '')
      .replace(/part\d+/g, '')
      .trim();
  };

  // Process data with deduplication
  const processedData = useMemo(() => {
    const rawData = hasSearchQuery ? searchData : browseData;
    if (!rawData) return { results: [], totalPages: 0, totalResults: 0, hasNextPage: false };

    let results = [...(rawData.results || [])];

    // Deduplicate by normalized title - keep the one with more info (higher rating, more episodes)
    const seen = new Map<string, typeof results[0]>();
    for (const anime of results) {
      const key = normalizeTitle(anime.title || '');
      const existing = seen.get(key);
      
      if (!existing) {
        seen.set(key, anime);
      } else {
        // Keep the one with better data
        const existingScore = (existing.rating || 0) + (existing.episodes || 0) + (existing.image ? 10 : 0);
        const newScore = (anime.rating || 0) + (anime.episodes || 0) + (anime.image ? 10 : 0);
        if (newScore > existingScore) {
          seen.set(key, anime);
        }
      }
    }
    results = Array.from(seen.values());

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

  // Save/Restore scroll position
  useEffect(() => {
    // Only restore once when not loading and data is present
    if (!isLoading && processedData.results.length > 0 && !scrollRestored.current) {
      try {
        const positions = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || '{}');
        const pos = positions[filterStateKey];
        if (pos > 0) {
          // Use multiple attempts to ensure rendering is complete across various devices/loads
          const attempts = [0, 20, 50, 100, 200, 400, 600, 800, 1000];
          attempts.forEach(delay => {
            setTimeout(() => {
              // Only scroll if we haven't manually scrolled away yet (approximate)
              if (window.scrollY < pos + 100) {
                window.scrollTo({ top: pos, behavior: 'instant' });
              }
            }, delay);
          });
          scrollRestored.current = true;
        } else {
          scrollRestored.current = true;
        }
      } catch (e) { /* ignore */ }
    }
  }, [filterStateKey, isLoading, processedData.results.length]);

  // Reset scroll restoration flag when filters change
  useEffect(() => {
    scrollRestored.current = false;
  }, [filterStateKey]);

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

  const FiltersContent = () => {
    // Popular genres shown first
    const popularGenres = mode === 'adult' 
      ? ['Hentai', 'Ecchi', 'Uncensored', 'MILF', 'Romance', 'School Girls', 'Vanilla']
      : ['Action', 'Romance', 'Comedy', 'Fantasy', 'Slice of Life', 'Supernatural', 'Drama'];
    
    let allGenres = SAFE_GENRES;
    if (mode === 'adult') allGenres = ADULT_GENRES;
    else if (mode === 'mixed') allGenres = MIXED_GENRES;
    
    const otherGenres = allGenres.filter(g => !popularGenres.includes(g));

    return (
      <div className="space-y-6 p-1">
        {/* Format Type */}
        <FilterSection title="Format">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'TV', label: 'TV Series' },
              { id: 'Movie', label: 'Movie' },
              { id: 'OVA', label: 'OVA' },
              { id: 'ONA', label: 'ONA' },
              { id: 'Special', label: 'Special' }
            ].map((t) => (
              <Button
                key={t.id}
                variant={typeFilter === t.id ? "default" : "outline"}
                size="sm"
                onClick={() => { setTypeFilter(typeFilter === t.id ? 'all' : t.id as TypeFilter); setPage(1); }}
                className={cn(
                  "h-9 rounded-lg text-xs gap-1.5",
                  typeFilter === t.id 
                    ? "bg-fox-orange hover:bg-fox-orange/90 border-fox-orange" 
                    : "bg-secondary/30 border-white/10 hover:border-fox-orange/50 hover:text-fox-orange"
                )}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </FilterSection>

        {/* Status */}
        <FilterSection title="Status">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'Ongoing', label: 'Airing', color: 'green' },
              { id: 'Completed', label: 'Finished', color: 'blue' },
              { id: 'Upcoming', label: 'Coming Soon', color: 'yellow' }
            ].map((s) => (
              <Button
                key={s.id}
                variant={statusFilter === s.id ? "default" : "outline"}
                size="sm"
                onClick={() => { setStatusFilter(statusFilter === s.id ? 'all' : s.id as StatusFilter); setPage(1); }}
                className={cn(
                  "h-9 rounded-lg text-xs",
                  statusFilter === s.id 
                    ? `bg-${s.color}-600 hover:bg-${s.color}-700` 
                    : "bg-secondary/30 border-white/10 hover:border-white/30"
                )}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </FilterSection>

        <Separator className="bg-white/5" />

        {/* Popular Genres */}
        <FilterSection title="Popular Genres">
          <div className="flex flex-wrap gap-2">
            {popularGenres.map((g) => (
              <Badge
                key={g}
                variant={selectedGenres.includes(g) ? "default" : "outline"}
                className={cn(
                  "cursor-pointer transition-all text-xs py-1.5 px-3",
                  selectedGenres.includes(g) 
                    ? "bg-fox-orange text-white hover:bg-fox-orange/90 border-transparent shadow-lg shadow-fox-orange/20" 
                    : "text-muted-foreground hover:text-white hover:border-fox-orange/50 bg-secondary/20"
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
        </FilterSection>

        {/* All Genres - Collapsible */}
        <FilterSection title="All Genres" collapsible defaultOpen={false}>
          <ScrollArea className="h-[250px] pr-4">
            <div className="flex flex-wrap gap-1.5">
              {otherGenres.map((g) => (
                <Badge
                  key={g}
                  variant={selectedGenres.includes(g) ? "default" : "outline"}
                  className={cn(
                    "cursor-pointer transition-all text-xs py-1 px-2",
                    selectedGenres.includes(g) 
                      ? "bg-fox-orange text-white hover:bg-fox-orange/90 border-transparent" 
                      : "text-muted-foreground/70 hover:text-white hover:border-white/30 bg-transparent border-white/10"
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

        {/* Active Filters Summary */}
        {(selectedGenres.length > 0 || typeFilter !== 'all' || statusFilter !== 'all' || selectedYearRange > 0) && (
          <>
            <Separator className="bg-white/5" />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Active Filters</span>
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2">
                  Clear All
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {typeFilter !== 'all' && (
                  <Badge className="bg-purple-600/20 text-purple-400 border-purple-600/30 text-xs">
                    {typeFilter}
                    <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => setTypeFilter('all')} />
                  </Badge>
                )}
                {statusFilter !== 'all' && (
                  <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-xs">
                    {statusFilter}
                    <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => setStatusFilter('all')} />
                  </Badge>
                )}
                {selectedYearRange > 0 && (
                  <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30 text-xs">
                    {YEAR_RANGES[selectedYearRange].label}
                    <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => setSelectedYearRange(0)} />
                  </Badge>
                )}
                {selectedGenres.map(g => (
                  <Badge key={g} className="bg-fox-orange/20 text-fox-orange border-fox-orange/30 text-xs">
                    {g}
                    <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => setSelectedGenres(prev => prev.filter(x => x !== g))} />
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background font-sans text-foreground flex flex-col">
      <Navbar />

      {/* Search Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-white/5 py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex gap-4 items-center justify-center">

          <div className="flex-1 max-w-4xl flex items-center gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
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

            {/* Content Settings Dropdown */}
            <Select value={mode} onValueChange={(v: 'safe' | 'mixed' | 'adult') => { setMode(v); setPage(1); }}>
              <SelectTrigger className={cn(
                "w-[180px] h-12 rounded-xl bg-secondary/50 border-white/10 font-medium transition-colors",
                mode !== 'safe' && "border-fox-orange/50 text-fox-orange bg-fox-orange/10"
              )}>
                <SelectValue placeholder="Content Visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="safe">Safe Only (Default)</SelectItem>
                <SelectItem value="mixed">Mixed Content</SelectItem>
                <SelectItem value="adult">+18 Only</SelectItem>
              </SelectContent>
            </Select>

            {/* Mobile Filter Button */}
            <div className="flex items-center gap-2 lg:hidden">
              <Sheet open={isMobileFiltersOpen} onOpenChange={setIsMobileFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="lg" className="gap-2 h-12 rounded-xl px-3">
                    <Filter className="w-5 h-5" />
                    {(selectedGenres.length > 0 || typeFilter !== 'all' || statusFilter !== 'all') && (
                      <Badge variant="secondary" className="px-1.5 h-5 min-w-[1.25rem] flex items-center justify-center bg-fox-orange text-white">
                        {selectedGenres.length + (typeFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)}
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
                <div className="mt-12 mb-20 flex flex-col items-center gap-6">
                  <div className="flex flex-wrap justify-center items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1 || isFetching}
                      className="rounded-xl border-white/10 hover:border-fox-orange/50 hover:text-fox-orange"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>

                    <div className="flex items-center gap-1">
                      {(() => {
                        const total = processedData.totalPages;
                        const current = page;
                        const delta = 1;
                        const range = [];
                        const rangeWithDots = [];

                        for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
                          range.push(i);
                        }

                        if (current - delta > 2) {
                          rangeWithDots.push(1, "...");
                        } else {
                          rangeWithDots.push(1);
                        }

                        rangeWithDots.push(...range);

                        if (current + delta < total - 1) {
                          rangeWithDots.push("...", total);
                        } else if (total > 1) {
                          rangeWithDots.push(total);
                        }

                        return rangeWithDots.map((p, i) => (
                          <React.Fragment key={i}>
                            {p === "..." ? (
                              <span className="px-2 text-muted-foreground">...</span>
                            ) : (
                              <Button
                                variant={page === p ? "default" : "outline"}
                                size="sm"
                                onClick={() => setPage(p as number)}
                                className={cn(
                                  "min-w-[40px] h-10 rounded-xl transition-all font-medium",
                                  page === p
                                    ? "bg-fox-orange text-white hover:bg-fox-orange/90 shadow-[0_0_15px_rgba(255,102,0,0.3)]"
                                    : "border-white/10 hover:border-fox-orange/50 hover:text-fox-orange bg-secondary/30"
                                )}
                              >
                                {p}
                              </Button>
                            )}
                          </React.Fragment>
                        ));
                      })()}
                    </div>

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage(p => p + 1)}
                      disabled={!processedData.hasNextPage || isFetching}
                      className="rounded-xl border-white/10 hover:border-fox-orange/50 hover:text-fox-orange"
                    >
                      {isFetching ? <Loader2 className="w-4 h-4 animate-spin text-fox-orange" /> : <ChevronRight className="w-4 h-4" />}
                    </Button>
                  </div>

                  {/* Jump to page */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const p = parseInt(jumpPage);
                      if (!isNaN(p) && p >= 1 && p <= processedData.totalPages) {
                        setPage(p);
                        setJumpPage("");
                      }
                    }}
                    className="flex items-center gap-3 bg-secondary/30 p-1.5 pl-4 rounded-xl border border-white/5"
                  >
                    <span className="text-sm text-muted-foreground font-medium">Jump to page</span>
                    <Input
                      type="number"
                      min={1}
                      max={processedData.totalPages}
                      value={jumpPage}
                      onChange={(e) => setJumpPage(e.target.value)}
                      className="w-16 h-8 bg-background/50 border-white/10 text-center text-sm rounded-lg"
                      placeholder="#"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      className="h-8 rounded-lg bg-fox-orange hover:bg-fox-orange/90"
                      disabled={!jumpPage || parseInt(jumpPage) < 1 || parseInt(jumpPage) > processedData.totalPages}
                    >
                      Go
                    </Button>
                  </form>
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
