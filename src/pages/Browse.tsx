import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { AnimeGrid } from '@/components/anime/AnimeGrid';
import { useSearch, useBrowse } from '@/hooks/useAnime';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Search as SearchIcon,
  X,
  Loader2,
  SlidersHorizontal,
  LayoutGrid,
  Grid3X3,
  ChevronLeft,
  ChevronRight,
  Flame,
  Clock,
  TrendingUp,
  Shuffle,
  Tv,
  Film,
  Play,
  Clapperboard,
  Sparkles,
  CheckCircle2,
  CalendarClock,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const SCROLL_POSITIONS_KEY = 'anistream_scroll_positions';
const SCROLL_MODE_KEY = 'anistream_scroll_mode';

type SearchSortOption = 'relevance' | 'rating' | 'year' | 'title' | 'episodes';
type BrowseSortOption = 'popularity' | 'trending' | 'recently_released' | 'shuffle';
type TypeFilter = 'all' | 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special';
type StatusFilter = 'all' | 'Ongoing' | 'Completed' | 'Upcoming';

const SAFE_GENRES = [
  'Action', 'Adventure', 'Cars', 'Comedy', 'Dementia', 'Demons', 'Drama',
  'Fantasy', 'Game', 'Harem', 'Historical', 'Horror', 'Isekai', 'Josei', 'Kids',
  'Magic', 'Martial Arts', 'Mecha', 'Military', 'Music', 'Mystery', 'Parody',
  'Police', 'Psychological', 'Romance', 'Samurai', 'School', 'Sci-Fi', 'Seinen',
  'Shoujo', 'Shounen', 'Slice of Life', 'Space',
  'Sports', 'Super Power', 'Supernatural', 'Thriller', 'Vampire'
];

const ADULT_GENRES = [
  'Hentai', 'Ecchi', 'Yaoi', 'Yuri',
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
  'Blow Job', 'Boob Job', 'Glasses', 'Hand Job', 'Horror', 'Inflation', 'Loli',
  'Masturbation', 'Mind Control', 'Monster', 'Nekomimi', 'Orgy', 'Plot',
  'Reverse Rape', 'Shota', 'Softcore', 'Teacher', 'Threesome', 'Trap',
  'Ugly Bastard', 'Female Doctor', 'Female Teacher'
];

const MIXED_GENRES = [...SAFE_GENRES, ...ADULT_GENRES].sort();

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

const FORMAT_OPTIONS = [
  { id: 'TV', label: 'TV Series', icon: Tv },
  { id: 'Movie', label: 'Movies', icon: Film },
  { id: 'OVA', label: 'OVA', icon: Play },
  { id: 'ONA', label: 'ONA', icon: Clapperboard },
  { id: 'Special', label: 'Specials', icon: Sparkles },
];

const STATUS_OPTIONS = [
  { id: 'Ongoing', label: 'Airing', icon: CalendarClock, color: 'emerald' },
  { id: 'Completed', label: 'Finished', icon: CheckCircle2, color: 'blue' },
  { id: 'Upcoming', label: 'Coming Soon', icon: Clock, color: 'amber' },
];

const SORT_OPTIONS = [
  { id: 'popularity', icon: Flame, label: 'Popular' },
  { id: 'trending', icon: TrendingUp, label: 'Trending' },
  { id: 'recently_released', icon: Clock, label: 'Recent' },
  { id: 'shuffle', icon: Shuffle, label: 'Random' },
];

const Browse = () => {
  useDocumentTitle('Browse');
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const filterStateKey = useMemo(() => {
    const params = Array.from(searchParams.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return `${location.pathname}?${params}`;
  }, [location.pathname, searchParams]);

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
  const [genresExpanded, setGenresExpanded] = useState(true);
  
  // Scroll mode: 'infinite' (default) or 'paginated'
  const [scrollMode, setScrollMode] = useState<'infinite' | 'paginated'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(SCROLL_MODE_KEY) as 'infinite' | 'paginated') || 'infinite';
    }
    return 'infinite';
  });
  
  // Infinite scroll state
  const [allResults, setAllResults] = useState<typeof processedData.results>([]);
  const [infinitePage, setInfinitePage] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const hasMorePagesRef = useRef(hasMorePages);
  const isLoadingMoreRef = useRef(isLoadingMore);

  // Keep refs in sync with state
  useEffect(() => { hasMorePagesRef.current = hasMorePages; }, [hasMorePages]);
  useEffect(() => { isLoadingMoreRef.current = isLoadingMore; }, [isLoadingMore]);

  const isUpdatingFromUrl = useRef(false);
  const isFirstMount = useRef(true);
  const scrollRestored = useRef(false);
  const filtersChangedRef = useRef(false);

  // Persist scroll mode preference
  useEffect(() => {
    localStorage.setItem(SCROLL_MODE_KEY, scrollMode);
  }, [scrollMode]);

  // Toggle scroll mode handler
  const toggleScrollMode = useCallback(() => {
    setScrollMode(prev => {
      const newMode = prev === 'infinite' ? 'paginated' : 'infinite';
      if (newMode === 'infinite') {
        // Reset infinite scroll state when switching to infinite
        setAllResults([]);
        setInfinitePage(1);
        setHasMorePages(true);
        setPage(1);
      }
      return newMode;
    });
  }, []);

  useEffect(() => {
    if (isUpdatingFromUrl.current) return;

    const urlPage = parseInt(searchParams.get('page') || '1', 10);
    const urlType = (searchParams.get('type') as TypeFilter) || 'all';
    const urlStatus = (searchParams.get('status') as StatusFilter) || 'all';
    const urlYear = parseInt(searchParams.get('year') || '0', 10);
    const urlSort = (searchParams.get('sort') as BrowseSortOption) || 'popularity';
    const urlMode = (searchParams.get('mode') as 'safe' | 'mixed' | 'adult') || 'safe';
    const urlGenres = searchParams.get('genres')?.split(',').filter(Boolean) || searchParams.get('genre')?.split(',').filter(Boolean) || [];

    const needsPageSync = urlPage !== page;
    const needsTypeSync = urlType !== typeFilter;
    const needsStatusSync = urlStatus !== statusFilter;
    const needsYearSync = urlYear !== selectedYearRange;
    const needsSortSync = urlSort !== browseSortBy;
    const needsModeSync = urlMode !== mode;

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
      if (needsPageSync) setPage(urlPage);
      if (needsTypeSync) setTypeFilter(urlType);
      if (needsStatusSync) setStatusFilter(urlStatus);
      if (needsYearSync) setSelectedYearRange(urlYear);
      if (needsSortSync) setBrowseSortBy(urlSort);
      if (needsModeSync) setMode(urlMode);
      if (needsGenresSync) setSelectedGenres(validUrlGenres);
      setTimeout(() => { isUpdatingFromUrl.current = false; }, 0);
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

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== debouncedQuery) {
        setDebouncedQuery(query);
        if (!isFirstMount.current) setPage(1);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query, debouncedQuery]);

  useEffect(() => {
    const timer = setTimeout(() => { isFirstMount.current = false; }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Only scroll to top in paginated mode, not infinite scroll
  useEffect(() => {
    if (isFirstMount.current) return;
    if (scrollMode === 'paginated') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [page, scrollMode]);

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
    sessionStorage.setItem('last_browse_url', fullUrl);
    setSearchParams(params, { replace: true });
  }, [debouncedQuery, selectedGenres, typeFilter, statusFilter, selectedYearRange, browseSortBy, page, mode, setSearchParams, location.pathname]);

  const browseFilters = useMemo(() => ({
    type: typeFilter !== 'all' ? typeFilter : undefined,
    genre: selectedGenres.length > 0 ? selectedGenres.join(',') : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    startYear: YEAR_RANGES[selectedYearRange].startYear,
    endYear: YEAR_RANGES[selectedYearRange].endYear,
    sort: browseSortBy,
    mode: mode,
  }), [typeFilter, selectedGenres, statusFilter, selectedYearRange, browseSortBy, mode]);

  const [shuffleBypass, setShuffleBypass] = useState(0);
  const hasSearchQuery = debouncedQuery.length >= 2;

  // Use 100 results per page in infinite scroll mode for seamless experience
  const resultsPerPage = scrollMode === 'infinite' ? 100 : 25;

  const { data: browseData, isLoading: browseLoading, isFetching: browseFetching, error: browseError } = useBrowse(browseFilters, page, !hasSearchQuery, shuffleBypass > 0, resultsPerPage);
  const { data: searchData, isLoading: searchLoading, isFetching: searchFetching, error: searchError } = useSearch(debouncedQuery, page, undefined, hasSearchQuery, mode);

  const isLoading = hasSearchQuery ? searchLoading : browseLoading;
  const isFetching = hasSearchQuery ? searchFetching : browseFetching;
  const error = hasSearchQuery ? searchError : browseError;

  const normalizeTitle = (title: string): string => {
    return title.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/season\d+/g, '').replace(/part\d+/g, '').trim();
  };

  const processedData = useMemo(() => {
    const rawData = hasSearchQuery ? searchData : browseData;
    if (!rawData) return { results: [], totalPages: 0, totalResults: 0, hasNextPage: false };

    let results = [...(rawData.results || [])];
    const seen = new Map<string, typeof results[0]>();
    for (const anime of results) {
      const key = normalizeTitle(anime.title || '');
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, anime);
      } else {
        const existingScore = (existing.rating || 0) + (existing.episodes || 0) + (existing.image ? 10 : 0);
        const newScore = (anime.rating || 0) + (anime.episodes || 0) + (anime.image ? 10 : 0);
        if (newScore > existingScore) seen.set(key, anime);
      }
    }
    results = Array.from(seen.values());

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

  // Restore scroll position when returning to browse page
  useEffect(() => {
    if (!isLoading && displayResults.length > 0 && !scrollRestored.current) {
      try {
        const positions = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || '{}');
        const pos = positions[filterStateKey];
        if (pos > 0) {
          // Use requestAnimationFrame for smoother restoration
          requestAnimationFrame(() => {
            window.scrollTo({ top: pos, behavior: 'instant' });
          });
          scrollRestored.current = true;
        } else {
          scrollRestored.current = true;
        }
      } catch (e) { /* ignore */ }
    }
  }, [filterStateKey, isLoading, displayResults.length]);

  // Only reset scroll restored flag when filters actually change (not on initial mount)
  useEffect(() => { 
    if (!isFirstMount.current) {
      scrollRestored.current = false; 
    }
  }, [filterStateKey]);

  // Reset infinite scroll when filters change
  useEffect(() => {
    if (scrollMode === 'infinite') {
      setAllResults([]);
      setInfinitePage(1);
      setHasMorePages(true);
      filtersChangedRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseFilters, debouncedQuery, scrollMode]);

  // Accumulate results for infinite scroll
  useEffect(() => {
    if (scrollMode !== 'infinite' || !processedData.results.length) return;
    
    if (filtersChangedRef.current) {
      // First page after filter change - replace all results
      setAllResults(processedData.results);
      filtersChangedRef.current = false;
    } else if (page > 1 || infinitePage > 1) {
      // Subsequent pages - append results (deduplicate by id)
      setAllResults(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const newItems = processedData.results.filter(a => !existingIds.has(a.id));
        return [...prev, ...newItems];
      });
    } else {
      // Initial load
      setAllResults(processedData.results);
    }
    
    setHasMorePages(processedData.hasNextPage);
    setIsLoadingMore(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedData.results, scrollMode, page]);

  // Callback ref for infinite scroll trigger element
  const setLoadMoreRef = useCallback((node: HTMLDivElement | null) => {
    // Disconnect previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Store the node
    loadMoreRef.current = node;

    // Don't observe if not in infinite mode or no node
    if (scrollMode !== 'infinite' || !node) return;

    // Create new observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMorePagesRef.current && !isLoadingMoreRef.current) {
          setIsLoadingMore(true);
          setPage(prev => prev + 1);
          setInfinitePage(prev => prev + 1);
        }
      },
      { rootMargin: '600px', threshold: 0 }
    );

    observerRef.current.observe(node);
  }, [scrollMode]);

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Get display results based on scroll mode
  const displayResults = scrollMode === 'infinite' ? allResults : processedData.results;

  const clearFilters = () => {
    setTypeFilter('all');
    setStatusFilter('all');
    setBrowseSortBy('popularity');
    setSearchSortBy('relevance');
    setSelectedGenres([]);
    setSelectedYearRange(0);
    setPage(1);
    setQuery('');
    setMode('safe');
  };

  const handleShuffle = () => {
    setBrowseSortBy('shuffle');
    setPage(1);
    setShuffleBypass(prev => prev + 1);
  };

  const activeFilterCount = selectedGenres.length + (typeFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (selectedYearRange > 0 ? 1 : 0);

  let allGenres = SAFE_GENRES;
  if (mode === 'adult') allGenres = ADULT_GENRES;
  else if (mode === 'mixed') allGenres = MIXED_GENRES;

  const FilterPanel = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className={cn("flex flex-col h-full", isMobile ? "p-4" : "")}>
      {/* Filter Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-fox-orange/20 flex items-center justify-center">
            <SlidersHorizontal className="w-5 h-5 text-fox-orange" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Filters</h2>
            <p className="text-xs text-zinc-500">Refine your search</p>
          </div>
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-fox-orange transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        )}
      </div>

      {/* Format Section */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Format</h3>
        <div className="grid grid-cols-2 gap-2">
          {FORMAT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = typeFilter === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => { setTypeFilter(isActive ? 'all' : opt.id as TypeFilter); setPage(1); }}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "glass-button-active"
                    : "glass-button text-zinc-400 hover:text-white"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Status Section */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Status</h3>
        <div className="flex flex-col gap-2">
          {STATUS_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = statusFilter === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => { setStatusFilter(isActive ? 'all' : opt.id as StatusFilter); setPage(1); }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "glass-button-active"
                    : "glass-button text-zinc-400 hover:text-white"
                )}
              >
                <Icon className={cn("w-4 h-4", isActive && `text-${opt.color}-400`)} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Year Section */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Year</h3>
        <div className="flex flex-wrap gap-2">
          {YEAR_RANGES.map((range, idx) => (
            <button
              key={idx}
              onClick={() => { setSelectedYearRange(selectedYearRange === idx ? 0 : idx); setPage(1); }}
              className={cn(
                "filter-badge",
                selectedYearRange === idx ? "filter-badge-active" : "filter-badge-inactive"
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Genres Section */}
      <div className="flex-1 min-h-0">
        <button
          onClick={() => setGenresExpanded(!genresExpanded)}
          className="flex items-center justify-between w-full mb-3"
        >
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Genres {selectedGenres.length > 0 && `(${selectedGenres.length})`}
          </h3>
          {genresExpanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </button>
        {genresExpanded && (
          <div className="overflow-y-auto max-h-[280px] scrollbar-thin pr-1">
            <div className="flex flex-wrap gap-1.5">
              {allGenres.map((genre) => (
                <button
                  key={genre}
                  onClick={() => {
                    setSelectedGenres(prev => prev.includes(genre) ? prev.filter(x => x !== genre) : [...prev, genre]);
                    setPage(1);
                  }}
                  className={cn(
                    "filter-badge text-[11px]",
                    selectedGenres.includes(genre) ? "filter-badge-active" : "filter-badge-inactive"
                  )}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <Navbar />

      {/* Cinematic Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-fox-orange/[0.02] via-transparent to-purple-900/[0.03]" />
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-fox-orange/[0.03] rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-600/[0.03] rounded-full blur-[150px]" />
      </div>

      {/* Main Layout */}
      <div className="relative flex min-h-[calc(100vh-64px)]">
        {/* Desktop Sidebar Filter Panel */}
        <aside className="hidden lg:flex flex-col w-[280px] xl:w-[300px] shrink-0 sidebar-glass sticky top-16 h-[calc(100vh-64px)] overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
            <FilterPanel />
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0">
          {/* Search Header - Sticky */}
          <div className="sticky top-16 z-20 glass-panel-dark border-b border-white/[0.04] px-4 sm:px-6 lg:px-8 py-4">
            <div className="max-w-[1600px] mx-auto">
              <div className="flex items-center gap-4">
                {/* Search Input */}
                <div className="relative flex-1 max-w-2xl">
                  <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search anime titles..."
                    className="pl-12 h-12 glass-input rounded-xl text-base focus:ring-2 focus:ring-fox-orange/30 transition-all font-medium placeholder:text-zinc-600"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] flex items-center justify-center transition-colors"
                    >
                      <X className="w-4 h-4 text-zinc-400" />
                    </button>
                  )}
                </div>

                {/* Content Mode Selector */}
                <Select value={mode} onValueChange={(v: 'safe' | 'mixed' | 'adult') => { setMode(v); setPage(1); }}>
                  <SelectTrigger className={cn(
                    "w-[160px] h-12 rounded-xl glass-input font-medium transition-all",
                    mode !== 'safe' && "border-fox-orange/40 text-fox-orange bg-fox-orange/10"
                  )}>
                    <SelectValue placeholder="Content" />
                  </SelectTrigger>
                  <SelectContent className="glass-panel rounded-xl border-white/[0.1]">
                    <SelectItem value="safe">Safe Only</SelectItem>
                    <SelectItem value="mixed">Mixed Content</SelectItem>
                    <SelectItem value="adult">+18 Only</SelectItem>
                  </SelectContent>
                </Select>

                {/* Mobile Filter Button */}
                <Sheet open={isMobileFiltersOpen} onOpenChange={setIsMobileFiltersOpen}>
                  <SheetTrigger asChild>
                    <button className="lg:hidden relative flex items-center justify-center w-12 h-12 rounded-xl glass-button">
                      <SlidersHorizontal className="w-5 h-5 text-zinc-400" />
                      {activeFilterCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-fox-orange text-white text-[10px] font-bold flex items-center justify-center">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[320px] glass-panel border-r-white/[0.06] p-0 overflow-y-auto">
                    <SheetHeader className="p-4 border-b border-white/[0.06]">
                      <SheetTitle className="text-white">Filters</SheetTitle>
                    </SheetHeader>
                    <FilterPanel isMobile />
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="px-4 sm:px-6 lg:px-8 py-6">
            <div className="max-w-[1600px] mx-auto">
              {/* Active Filters Section */}
              {activeFilterCount > 0 && (
                <div className="mb-6 glass-card p-4 animate-fade-in">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-fox-orange" />
                      <h3 className="text-sm font-semibold text-white">
                        Active Filters ({activeFilterCount})
                      </h3>
                    </div>
                    <button
                      onClick={clearFilters}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Clear All
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {/* Type Filter */}
                    {typeFilter !== 'all' && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm">
                        <Tv className="w-3.5 h-3.5" />
                        <span className="font-medium">{typeFilter}</span>
                        <button
                          onClick={() => setTypeFilter('all')}
                          className="ml-1 hover:bg-purple-500/20 rounded p-0.5 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Status Filter */}
                    {statusFilter !== 'all' && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm">
                        {statusFilter === 'Ongoing' && <CalendarClock className="w-3.5 h-3.5" />}
                        {statusFilter === 'Completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {statusFilter === 'Upcoming' && <Clock className="w-3.5 h-3.5" />}
                        <span className="font-medium">{statusFilter}</span>
                        <button
                          onClick={() => setStatusFilter('all')}
                          className="ml-1 hover:bg-emerald-500/20 rounded p-0.5 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Year Filter */}
                    {selectedYearRange > 0 && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 text-sm">
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="font-medium">{YEAR_RANGES[selectedYearRange].label}</span>
                        <button
                          onClick={() => setSelectedYearRange(0)}
                          className="ml-1 hover:bg-blue-500/20 rounded p-0.5 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Genre Filters */}
                    {selectedGenres.map((genre) => (
                      <div
                        key={genre}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-fox-orange/20 border border-fox-orange/30 text-fox-orange text-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="font-medium">{genre}</span>
                        <button
                          onClick={() => setSelectedGenres(prev => prev.filter(g => g !== genre))}
                          className="ml-1 hover:bg-fox-orange/20 rounded p-0.5 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Results Header */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white">
                    {hasSearchQuery ? (
                      <>Results for "<span className="text-fox-orange">{debouncedQuery}</span>"</>
                    ) : (
                      'Discover Anime'
                    )}
                  </h1>
                  <p className="text-sm text-zinc-500 mt-1">
                    {isLoading ? 'Searching...' : `${processedData.totalResults.toLocaleString()} titles found`}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Sort Options */}
                  {!hasSearchQuery && (
                    <div className="flex glass-card p-1">
                      {SORT_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const isActive = browseSortBy === opt.id;
                        return (
                          <button
                            key={opt.id}
                            onClick={opt.id === 'shuffle' ? handleShuffle : () => { setBrowseSortBy(opt.id as BrowseSortOption); setPage(1); }}
                            className={cn(
                              "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                              isActive
                                ? "bg-fox-orange/20 text-fox-orange"
                                : "text-zinc-500 hover:text-white hover:bg-white/[0.06]"
                            )}
                            title={opt.label}
                          >
                            <Icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {hasSearchQuery && (
                    <Select value={searchSortBy} onValueChange={(v: SearchSortOption) => setSearchSortBy(v)}>
                      <SelectTrigger className="w-32 h-10 rounded-xl glass-input text-sm">
                        <SelectValue placeholder="Sort" />
                      </SelectTrigger>
                      <SelectContent className="glass-panel rounded-xl">
                        <SelectItem value="relevance">Relevance</SelectItem>
                        <SelectItem value="rating">Rating</SelectItem>
                        <SelectItem value="year">Newest</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {/* Scroll Mode Toggle */}
                  <div className="flex glass-card p-1" title={scrollMode === 'infinite' ? 'Switch to paginated' : 'Switch to infinite scroll'}>
                    <button
                      onClick={toggleScrollMode}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                        "text-zinc-400 hover:text-white hover:bg-white/[0.06]"
                      )}
                    >
                      {scrollMode === 'infinite' ? (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z" />
                          </svg>
                          <span className="hidden sm:inline">Infinite</span>
                        </>
                      ) : (
                        <>
                          <Layers className="w-4 h-4" />
                          <span className="hidden sm:inline">Pages</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Grid Size Toggle */}
                  <div className="flex glass-card p-1">
                    <button
                      onClick={() => setGridSize('compact')}
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
                        gridSize === 'compact' ? "bg-fox-orange/20 text-fox-orange" : "text-zinc-500 hover:text-white"
                      )}
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setGridSize('normal')}
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
                        gridSize === 'normal' ? "bg-fox-orange/20 text-fox-orange" : "text-zinc-500 hover:text-white"
                      )}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Error State */}
              {error && (
                <div className="glass-card p-6 mb-6 border-red-500/20">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                      <X className="w-6 h-6 text-red-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-red-400">Something went wrong</h3>
                      <p className="text-sm text-zinc-500">{error.message || 'Failed to load anime. Please try again.'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading State */}
              {isLoading ? (
                <div className={cn(
                  "grid gap-4 sm:gap-5",
                  gridSize === 'compact'
                    ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7"
                    : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                )}>
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div key={i} className="space-y-3">
                      <Skeleton className="aspect-[2/3] w-full rounded-xl bg-white/[0.04]" />
                      <Skeleton className="h-4 w-3/4 rounded-lg bg-white/[0.04]" />
                    </div>
                  ))}
                </div>
              ) : displayResults.length === 0 ? (
                /* Empty State */
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-20 h-20 rounded-2xl glass-card flex items-center justify-center mb-6">
                    <SearchIcon className="w-10 h-10 text-zinc-600" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">No results found</h3>
                  <p className="text-zinc-500 max-w-md mb-6">
                    We couldn't find any anime matching your criteria. Try adjusting your filters or search query.
                  </p>
                  <Button onClick={clearFilters} className="bg-fox-orange hover:bg-fox-orange/90 text-white rounded-xl px-6">
                    Clear All Filters
                  </Button>
                </div>
              ) : (
                <>
                  {/* Results Grid */}
                  <AnimeGrid
                    anime={displayResults}
                    columns={gridSize === 'compact' ? 7 : 6}
                  />

                  {/* Infinite Scroll Loading Indicator */}
                  {scrollMode === 'infinite' && (
                    <>
                      <div ref={setLoadMoreRef} className="h-20" />
                      {(isLoadingMore || isFetching) && hasMorePages && (
                        <div className="mt-4 flex justify-center">
                          <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-card">
                            <Loader2 className="w-4 h-4 animate-spin text-fox-orange" />
                            <span className="text-xs text-zinc-500">Loading...</span>
                          </div>
                        </div>
                      )}
                      {!hasMorePages && displayResults.length > 0 && (
                        <div className="mt-12 flex flex-col items-center gap-2 py-8">
                          <div className="w-12 h-1 rounded-full bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
                          <p className="text-sm text-zinc-600">You've reached the end</p>
                          <p className="text-xs text-zinc-700">{displayResults.length} titles loaded</p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Pagination (only in paginated mode) */}
                  {scrollMode === 'paginated' && processedData.totalPages > 1 && (
                    <div className="mt-12 flex flex-col items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1 || isFetching}
                          className="w-10 h-10 rounded-xl glass-button border-0"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>

                        <div className="flex items-center gap-1">
                          {(() => {
                            const total = processedData.totalPages;
                            const current = page;
                            const delta = 2;
                            const range: number[] = [];
                            const rangeWithDots: (number | string)[] = [];

                            for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
                              range.push(i);
                            }

                            if (current - delta > 2) rangeWithDots.push(1, "...");
                            else rangeWithDots.push(1);

                            rangeWithDots.push(...range);

                            if (current + delta < total - 1) rangeWithDots.push("...", total);
                            else if (total > 1) rangeWithDots.push(total);

                            return rangeWithDots.map((p, i) => (
                              <React.Fragment key={i}>
                                {p === "..." ? (
                                  <span className="px-2 text-zinc-600">...</span>
                                ) : (
                                  <button
                                    onClick={() => setPage(p as number)}
                                    className={cn(
                                      "min-w-[40px] h-10 rounded-xl font-medium transition-all",
                                      page === p
                                        ? "bg-fox-orange text-white shadow-lg shadow-fox-orange/30"
                                        : "glass-button text-zinc-400 hover:text-white"
                                    )}
                                  >
                                    {p}
                                  </button>
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
                          className="w-10 h-10 rounded-xl glass-button border-0"
                        >
                          {isFetching ? <Loader2 className="w-4 h-4 animate-spin text-fox-orange" /> : <ChevronRight className="w-4 h-4" />}
                        </Button>
                      </div>

                      {/* Jump to Page */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const p = parseInt(jumpPage);
                          if (!isNaN(p) && p >= 1 && p <= processedData.totalPages) {
                            setPage(p);
                            setJumpPage("");
                          }
                        }}
                        className="flex items-center gap-3 glass-card px-4 py-2"
                      >
                        <span className="text-sm text-zinc-500">Go to page</span>
                        <Input
                          type="number"
                          min={1}
                          max={processedData.totalPages}
                          value={jumpPage}
                          onChange={(e) => setJumpPage(e.target.value)}
                          className="w-16 h-8 glass-input text-center text-sm rounded-lg"
                          placeholder="#"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          className="h-8 rounded-lg bg-fox-orange hover:bg-fox-orange/90 text-white"
                          disabled={!jumpPage || parseInt(jumpPage) < 1 || parseInt(jumpPage) > processedData.totalPages}
                        >
                          Go
                        </Button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Browse;
