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
  const [currentSection, setCurrentSection] = useState(1); // Track current visible section for seamless mode switching
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const hasMorePagesRef = useRef(hasMorePages);
  const isLoadingMoreRef = useRef(isLoadingMore);
  const resultsContainerRef = useRef<HTMLDivElement | null>(null);

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

  // Toggle scroll mode handler with seamless page conversion
  const toggleScrollMode = useCallback(() => {
    setScrollMode(prev => {
      const newMode = prev === 'infinite' ? 'paginated' : 'infinite';
      if (newMode === 'infinite') {
        // Switching to infinite: reset state, start from page 1 but preserve position via currentSection
        setAllResults([]);
        setInfinitePage(1);
        setCurrentSection(page); // Remember where we were in paginated mode
        setHasMorePages(true);
        setPage(1); // Reset page to 1 for infinite mode (won't show in URL)
      } else {
        // Switching to paginated: convert current section to page number
        setPage(currentSection);
      }
      return newMode;
    });
  }, [page, currentSection]);

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
    const container = resultsContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      try {
        const positions = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || '{}');
        positions[filterStateKey] = container.scrollTop;
        sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
      } catch (e) { /* ignore */ }
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
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
    if (scrollMode === 'paginated' && resultsContainerRef.current) {
      resultsContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
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
    // Only add page to URL in paginated mode, not infinite scroll
    if (scrollMode === 'paginated' && page > 1) params.page = page.toString();
    if (mode !== 'safe') params.mode = mode;

    const newSearch = new URLSearchParams(params).toString();
    const fullUrl = `${location.pathname}${newSearch ? `?${newSearch}` : ''}`;
    sessionStorage.setItem('last_browse_url', fullUrl);
    setSearchParams(params, { replace: true });
  }, [debouncedQuery, selectedGenres, typeFilter, statusFilter, selectedYearRange, browseSortBy, page, mode, scrollMode, setSearchParams, location.pathname]);

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

  // In infinite mode, use infinitePage for API calls; in paginated mode, use page
  const apiPage = scrollMode === 'infinite' ? infinitePage : page;

  const { data: browseData, isLoading: browseLoading, isFetching: browseFetching, error: browseError } = useBrowse(browseFilters, apiPage, !hasSearchQuery, shuffleBypass > 0, resultsPerPage);
  const { data: searchData, isLoading: searchLoading, isFetching: searchFetching, error: searchError } = useSearch(debouncedQuery, apiPage, undefined, hasSearchQuery, mode);

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

  // Get display results based on scroll mode - MUST be after processedData
  const displayResults = scrollMode === 'infinite' ? allResults : processedData.results;

  // Restore scroll position when returning to browse page
  useEffect(() => {
    if (!isLoading && displayResults.length > 0 && !scrollRestored.current && resultsContainerRef.current) {
      try {
        const positions = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || '{}');
        const pos = positions[filterStateKey];
        if (pos > 0) {
          // Use requestAnimationFrame for smoother restoration
          requestAnimationFrame(() => {
            resultsContainerRef.current?.scrollTo({ top: pos, behavior: 'instant' as ScrollBehavior });
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

  // Accumulate results for infinite scroll with section tracking
  useEffect(() => {
    if (scrollMode !== 'infinite' || !processedData.results.length) return;
    
    if (filtersChangedRef.current) {
      // First page after filter change - replace all results
      setAllResults(processedData.results);
      setCurrentSection(1);
      filtersChangedRef.current = false;
    } else if (page > 1 || infinitePage > 1) {
      // Subsequent pages - append results (deduplicate by id)
      setAllResults(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const newItems = processedData.results.filter(a => !existingIds.has(a.id));
        return [...prev, ...newItems];
      });
      // Update current section based on loaded pages
      setCurrentSection(infinitePage);
    } else {
      // Initial load
      setAllResults(processedData.results);
      setCurrentSection(1);
    }
    
    setHasMorePages(processedData.hasNextPage);
    setIsLoadingMore(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedData.results, scrollMode, page, infinitePage]);

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

    // Create new observer rooted in the results container
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMorePagesRef.current && !isLoadingMoreRef.current) {
          setIsLoadingMore(true);
          // Only increment infinitePage, not page (page stays at 1 in infinite mode)
          setInfinitePage(prev => prev + 1);
        }
      },
      { root: resultsContainerRef.current, rootMargin: '600px', threshold: 0 }
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
          <h2 className="text-[13px] font-semibold text-zinc-200">Filters</h2>
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Format Section */}
      <div className="mb-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">Format</h3>
        <div className="grid grid-cols-2 gap-1">
          {FORMAT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = typeFilter === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => { setTypeFilter(isActive ? 'all' : opt.id as TypeFilter); setPage(1); }}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] transition-colors",
                  isActive
                    ? "bg-white/[0.08] text-white"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                )}
              >
                <Icon className="w-3 h-3" />
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-white/[0.05] my-1" />

      {/* Status Section */}
      <div className="mb-4 mt-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">Status</h3>
        <div className="flex flex-col gap-0.5">
          {STATUS_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = statusFilter === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => { setStatusFilter(isActive ? 'all' : opt.id as StatusFilter); setPage(1); }}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-colors",
                  isActive
                    ? "bg-white/[0.08] text-white"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                )}
              >
                <Icon className="w-3 h-3" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-white/[0.05] my-1" />

      {/* Year Section */}
      <div className="mb-4 mt-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">Year</h3>
        <div className="flex flex-wrap gap-1">
          {YEAR_RANGES.map((range, idx) => (
            <button
              key={idx}
              onClick={() => { setSelectedYearRange(selectedYearRange === idx ? 0 : idx); setPage(1); }}
              className={cn(
                "px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
                selectedYearRange === idx
                  ? "bg-fox-orange/15 text-fox-orange"
                  : "text-zinc-500 hover:text-zinc-300 bg-white/[0.03] hover:bg-white/[0.06]"
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-white/[0.05] my-1" />

      {/* Genres Section */}
      <div className="flex-1 min-h-0 mt-3">
        <button
          onClick={() => setGenresExpanded(!genresExpanded)}
          className="flex items-center justify-between w-full mb-2 group"
        >
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
            Genres {selectedGenres.length > 0 && <span className="text-fox-orange">({selectedGenres.length})</span>}
          </h3>
          {genresExpanded ? (
            <ChevronUp className="w-3 h-3 text-zinc-700 group-hover:text-zinc-500 transition-colors" />
          ) : (
            <ChevronDown className="w-3 h-3 text-zinc-700 group-hover:text-zinc-500 transition-colors" />
          )}
        </button>
        {genresExpanded && (
          <div className="overflow-y-auto max-h-[280px] scrollbar-thin pr-1">
            <div className="flex flex-wrap gap-1">
              {allGenres.map((genre) => (
                <button
                  key={genre}
                  onClick={() => {
                    setSelectedGenres(prev => prev.includes(genre) ? prev.filter(x => x !== genre) : [...prev, genre]);
                    setPage(1);
                  }}
                  className={cn(
                    "px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
                    selectedGenres.includes(genre)
                      ? "bg-fox-orange/15 text-fox-orange"
                      : "text-zinc-500 hover:text-zinc-300 bg-white/[0.03] hover:bg-white/[0.06]"
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
    <div className="h-screen flex flex-col overflow-hidden bg-background font-sans text-foreground">
      <Navbar />

      {/* App Shell Body */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-[200px] xl:w-[220px] shrink-0 border-r border-white/[0.06] overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4 pt-5">
            <FilterPanel />
          </div>
        </aside>

        {/* Right Panel */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Fixed search bar — matches grid padding */}
          <div className="shrink-0 px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 border-b border-white/[0.06]">
            <div className="max-w-[1600px] mx-auto space-y-2 sm:space-y-0">
              {/* Row 1: Search + Filter button (mobile) / All controls (desktop) */}
              <div className="flex items-center gap-2">
                {/* Search Input */}
                <div className="relative flex-1 sm:max-w-md">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search anime..."
                    className="pl-9 h-10 sm:h-9 bg-white/[0.04] border border-white/[0.06] rounded-lg text-sm focus:ring-0 focus-visible:ring-0 focus:border-white/[0.12] transition-colors placeholder:text-zinc-600"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors touch-manipulation"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Results count — desktop only */}
                <div className="hidden sm:flex items-center gap-1.5 min-w-0 mr-auto">
                  <span className="text-[11px] text-zinc-600 shrink-0">
                    {isLoading ? '...' : `${processedData.totalResults.toLocaleString()} titles`}
                  </span>
                </div>

                {/* Sort Options — desktop only */}
                {!hasSearchQuery && (
                  <div className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                    {SORT_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isActive = browseSortBy === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={opt.id === 'shuffle' ? handleShuffle : () => { setBrowseSortBy(opt.id as BrowseSortOption); setPage(1); }}
                          className={cn(
                            "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors",
                            isActive
                              ? "bg-white/[0.08] text-white"
                              : "text-zinc-500 hover:text-zinc-300"
                          )}
                          title={opt.label}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span className="hidden xl:inline">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {hasSearchQuery && (
                  <Select value={searchSortBy} onValueChange={(v: SearchSortOption) => setSearchSortBy(v)}>
                    <SelectTrigger className="hidden sm:flex w-28 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent className="bg-[hsl(220,20%,8%)] rounded-lg border border-white/[0.08]">
                      <SelectItem value="relevance">Relevance</SelectItem>
                      <SelectItem value="rating">Rating</SelectItem>
                      <SelectItem value="year">Newest</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {/* Content Mode — desktop only */}
                <Select value={mode} onValueChange={(v: 'safe' | 'mixed' | 'adult') => { setMode(v); setPage(1); }}>
                  <SelectTrigger className={cn(
                    "hidden sm:flex w-[100px] h-8 rounded-lg text-[11px] font-medium bg-white/[0.04] border border-white/[0.06] transition-colors",
                    mode !== 'safe' && "border-fox-orange/30 text-fox-orange"
                  )}>
                    <SelectValue placeholder="Content" />
                  </SelectTrigger>
                  <SelectContent className="bg-[hsl(220,20%,8%)] rounded-lg border border-white/[0.08]">
                    <SelectItem value="safe">Safe Only</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                    <SelectItem value="adult">+18 Only</SelectItem>
                  </SelectContent>
                </Select>

                {/* Scroll Mode — desktop only */}
                <button
                  onClick={toggleScrollMode}
                  title={scrollMode === 'infinite' ? 'Switch to paginated' : 'Switch to infinite scroll'}
                  className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {scrollMode === 'infinite' ? (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z" />
                    </svg>
                  ) : (
                    <Layers className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* Grid Size — desktop only */}
                <div className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                  <button
                    onClick={() => setGridSize('compact')}
                    className={cn(
                      "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
                      gridSize === 'compact' ? "bg-white/[0.08] text-white" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <Grid3X3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setGridSize('normal')}
                    className={cn(
                      "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
                      gridSize === 'normal' ? "bg-white/[0.08] text-white" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Mobile Filter Button */}
                <Sheet open={isMobileFiltersOpen} onOpenChange={setIsMobileFiltersOpen}>
                  <SheetTrigger asChild>
                    <button className="lg:hidden relative flex items-center justify-center w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition-colors touch-manipulation">
                      <SlidersHorizontal className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-zinc-500" />
                      {activeFilterCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-3.5 sm:h-3.5 rounded-full bg-fox-orange text-white text-[8px] sm:text-[7px] font-bold flex items-center justify-center">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[300px] sm:w-[280px] bg-background border-r border-white/[0.06] p-0 overflow-y-auto">
                    <SheetHeader className="p-4 border-b border-white/[0.06]">
                      <SheetTitle className="text-white text-sm font-semibold">Filters</SheetTitle>
                    </SheetHeader>
                    <FilterPanel isMobile />
                  </SheetContent>
                </Sheet>
              </div>

              {/* Row 2: Mobile-only sort & mode controls */}
              <div className="flex sm:hidden items-center gap-1.5">
                {/* Mobile Sort */}
                {!hasSearchQuery ? (
                  <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                    {SORT_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isActive = browseSortBy === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={opt.id === 'shuffle' ? handleShuffle : () => { setBrowseSortBy(opt.id as BrowseSortOption); setPage(1); }}
                          className={cn(
                            "flex items-center gap-1 px-2.5 py-2 rounded-md text-[11px] font-medium transition-colors touch-manipulation",
                            isActive
                              ? "bg-white/[0.08] text-white"
                              : "text-zinc-500"
                          )}
                          title={opt.label}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span className="text-[10px]">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Select value={searchSortBy} onValueChange={(v: SearchSortOption) => setSearchSortBy(v)}>
                    <SelectTrigger className="w-28 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent className="bg-[hsl(220,20%,8%)] rounded-lg border border-white/[0.08]">
                      <SelectItem value="relevance">Relevance</SelectItem>
                      <SelectItem value="rating">Rating</SelectItem>
                      <SelectItem value="year">Newest</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                <div className="ml-auto flex items-center gap-1.5">
                  {/* Mobile Content Mode */}
                  <Select value={mode} onValueChange={(v: 'safe' | 'mixed' | 'adult') => { setMode(v); setPage(1); }}>
                    <SelectTrigger className={cn(
                      "w-[88px] h-9 rounded-lg text-[11px] font-medium bg-white/[0.04] border border-white/[0.06] transition-colors touch-manipulation",
                      mode !== 'safe' && "border-fox-orange/30 text-fox-orange"
                    )}>
                      <SelectValue placeholder="Content" />
                    </SelectTrigger>
                    <SelectContent className="bg-[hsl(220,20%,8%)] rounded-lg border border-white/[0.08]">
                      <SelectItem value="safe">Safe Only</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                      <SelectItem value="adult">+18 Only</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Mobile results count */}
                  <span className="text-[10px] text-zinc-600 shrink-0">
                    {isLoading ? '...' : processedData.totalResults.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable Results Area */}
          <div ref={resultsContainerRef} className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="px-3 sm:px-4 lg:px-6 py-4">
              <div className="max-w-[1600px] mx-auto">
                {/* Active Filters */}
                {activeFilterCount > 0 && (
                  <div className="mb-4 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-zinc-600 mr-1">Filters:</span>
                    {typeFilter !== 'all' && (
                      <button onClick={() => setTypeFilter('all')} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.05] border border-white/[0.06] text-[11px] text-zinc-300 hover:border-white/[0.12] transition-colors">
                        {typeFilter}
                        <X className="w-3 h-3 text-zinc-500" />
                      </button>
                    )}
                    {statusFilter !== 'all' && (
                      <button onClick={() => setStatusFilter('all')} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.05] border border-white/[0.06] text-[11px] text-zinc-300 hover:border-white/[0.12] transition-colors">
                        {statusFilter}
                        <X className="w-3 h-3 text-zinc-500" />
                      </button>
                    )}
                    {selectedYearRange > 0 && (
                      <button onClick={() => setSelectedYearRange(0)} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.05] border border-white/[0.06] text-[11px] text-zinc-300 hover:border-white/[0.12] transition-colors">
                        {YEAR_RANGES[selectedYearRange].label}
                        <X className="w-3 h-3 text-zinc-500" />
                      </button>
                    )}
                    {selectedGenres.map((genre) => (
                      <button key={genre} onClick={() => setSelectedGenres(prev => prev.filter(g => g !== genre))} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.05] border border-white/[0.06] text-[11px] text-zinc-300 hover:border-white/[0.12] transition-colors">
                        {genre}
                        <X className="w-3 h-3 text-zinc-500" />
                      </button>
                    ))}
                    <button onClick={clearFilters} className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors ml-1">
                      Clear all
                    </button>
                  </div>
                )}

                {/* Error State */}
                {error && (
                  <div className="mb-4 p-4 rounded-lg border border-red-500/20 bg-red-500/[0.05]">
                    <p className="text-sm text-red-400">{error.message || 'Failed to load anime. Please try again.'}</p>
                  </div>
                )}

                {/* Loading State */}
                {isLoading ? (
                  <div className={cn(
                    "grid gap-3 sm:gap-4",
                    gridSize === 'compact'
                      ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7"
                      : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                  )}>
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="aspect-[2/3] w-full rounded-lg bg-white/[0.03]" />
                        <Skeleton className="h-3.5 w-3/4 rounded bg-white/[0.03]" />
                      </div>
                    ))}
                  </div>
                ) : displayResults.length === 0 ? (
                  /* Empty State */
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <SearchIcon className="w-8 h-8 text-zinc-700 mb-4" />
                    <h3 className="text-sm font-semibold text-zinc-300 mb-1">No results found</h3>
                    <p className="text-[13px] text-zinc-600 max-w-sm mb-4">
                      Try adjusting your filters or search query.
                    </p>
                    <Button onClick={clearFilters} className="bg-fox-orange hover:bg-fox-orange/90 text-white text-xs h-8 rounded-lg px-4">
                      Clear Filters
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Results Grid */}
                    <AnimeGrid
                      anime={displayResults}
                      columns={gridSize === 'compact' ? 5 : 4}
                    />

                    {/* Infinite Scroll Loading Indicator */}
                    {scrollMode === 'infinite' && (
                      <>
                        <div ref={setLoadMoreRef} className="h-20" />
                        {(isLoadingMore || isFetching) && hasMorePages && (
                          <div className="mt-4 flex justify-center">
                            <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
                          </div>
                        )}
                        {!hasMorePages && displayResults.length > 0 && (
                          <div className="mt-8 flex justify-center py-6">
                            <p className="text-[11px] text-zinc-700">{displayResults.length} titles loaded</p>
                          </div>
                        )}
                      </>
                    )}

                    {/* Pagination (only in paginated mode) */}
                    {scrollMode === 'paginated' && processedData.totalPages > 1 && (
                      <div className="mt-8 flex flex-col items-center gap-4 pb-8">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || isFetching}
                            className="w-8 h-8 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-30"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>

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
                                    <span className="px-1.5 text-zinc-700 text-xs">...</span>
                                  ) : (
                                    <button
                                      onClick={() => setPage(p as number)}
                                      className={cn(
                                        "min-w-[32px] h-8 rounded-md text-xs font-medium transition-colors",
                                        page === p
                                          ? "bg-fox-orange text-white"
                                          : "bg-white/[0.04] border border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.06]"
                                      )}
                                    >
                                      {p}
                                    </button>
                                  )}
                                </React.Fragment>
                              ));
                            })()}
                          </div>

                          <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={!processedData.hasNextPage || isFetching}
                            className="w-8 h-8 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-30"
                          >
                            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
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
                          className="flex items-center gap-2"
                        >
                          <span className="text-[11px] text-zinc-600">Page</span>
                          <Input
                            type="number"
                            min={1}
                            max={processedData.totalPages}
                            value={jumpPage}
                            onChange={(e) => setJumpPage(e.target.value)}
                            className="w-14 h-7 bg-white/[0.04] border border-white/[0.06] text-center text-xs rounded-md"
                            placeholder="#"
                          />
                          <Button
                            type="submit"
                            size="sm"
                            className="h-7 text-xs rounded-md bg-fox-orange hover:bg-fox-orange/90 text-white px-3"
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default Browse;
