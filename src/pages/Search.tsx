import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { AnimeGrid } from '@/components/anime/AnimeGrid';
import { useSearch } from '@/hooks/useAnime';
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

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
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

  // Fetch search results
  const {
    data: searchResult,
    isLoading,
    isFetching
  } = useSearch(debouncedQuery, page, undefined, debouncedQuery.length >= 2);

  // Filter and sort results
  const filteredResults = useMemo(() => {
    if (!searchResult?.results) return [];

    let results = [...searchResult.results];

    // Apply type filter
    if (typeFilter !== 'all') {
      results = results.filter(anime => anime.type === typeFilter);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      results = results.filter(anime => anime.status === statusFilter);
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
  }, [searchResult?.results, typeFilter, statusFilter, sortBy]);

  // Clear all filters
  const clearFilters = () => {
    setTypeFilter('all');
    setStatusFilter('all');
    setSortBy('relevance');
  };

  const hasActiveFilters = typeFilter !== 'all' || statusFilter !== 'all' || sortBy !== 'relevance';

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
              <span className="text-gradient-orange">Search</span>
              <span className="text-foreground"> Anime</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Discover thousands of anime from multiple streaming sources
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

            {/* Quick Search Tags */}
            {!debouncedQuery && (
              <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
                <span className="text-sm text-muted-foreground mr-2">Quick search:</span>
                {quickSearches.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => setQuery(item.query)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-fox-surface/60 hover:bg-fox-surface border border-white/5 hover:border-white/10 transition-all hover:scale-105"
                  >
                    {item.icon && <item.icon className="w-3.5 h-3.5" />}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Filters Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-8 p-4 rounded-2xl bg-fox-surface/30 border border-white/5">
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "h-10 px-4 rounded-xl gap-2",
              showFilters && 'bg-fox-orange hover:bg-fox-orange/90'
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <Badge className="ml-1 bg-white/20 text-xs">Active</Badge>
            )}
          </Button>

          {/* Sort Dropdown */}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-40 h-10 bg-fox-surface/50 border-white/10 rounded-xl">
              <ArrowUpDown className="w-4 h-4 mr-2" />
              <SelectValue />
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
          <div className="flex items-center gap-1 p-1 rounded-xl bg-fox-surface/50 border border-white/10">
            <button
              onClick={() => setGridSize('normal')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                gridSize === 'normal' ? 'bg-fox-orange text-white' : 'hover:bg-white/10'
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setGridSize('compact')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                gridSize === 'compact' ? 'bg-fox-orange text-white' : 'hover:bg-white/10'
              )}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-muted-foreground hover:text-foreground h-10 px-4 rounded-xl"
            >
              <X className="w-4 h-4 mr-1" />
              Clear filters
            </Button>
          )}

          {/* Results count */}
          <div className="ml-auto text-sm text-muted-foreground">
            {searchResult ? (
              <>
                <span className="font-semibold text-foreground">{filteredResults.length}</span> results
                {searchResult.totalPages > 1 && (
                  <span className="ml-2">
                    • Page <span className="font-semibold text-foreground">{page}</span> of {searchResult.totalPages}
                  </span>
                )}
              </>
            ) : debouncedQuery.length >= 2 ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching...
              </span>
            ) : null}
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="p-6 mb-8 bg-fox-surface/30 rounded-2xl border border-white/5 animate-in slide-in-from-top-2 duration-300">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <label className="text-sm font-semibold mb-3 block flex items-center gap-2">
                  <Tv className="w-4 h-4 text-fox-orange" />
                  Type
                </label>
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                  <SelectTrigger className="bg-background/50 border-white/10 rounded-xl h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="TV">TV Series</SelectItem>
                    <SelectItem value="Movie">Movie</SelectItem>
                    <SelectItem value="OVA">OVA</SelectItem>
                    <SelectItem value="ONA">ONA</SelectItem>
                    <SelectItem value="Special">Special</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-semibold mb-3 block flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  Status
                </label>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger className="bg-background/50 border-white/10 rounded-xl h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Ongoing">Ongoing</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Upcoming">Upcoming</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Search Results */}
        {!debouncedQuery ? (
          // Empty state - Start searching
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-fox-orange/20 to-orange-500/10 flex items-center justify-center mb-8 shadow-lg shadow-fox-orange/10">
              <Sparkles className="w-12 h-12 text-fox-orange" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Start Your Search</h2>
            <p className="text-muted-foreground max-w-md text-lg">
              Enter an anime title to search across multiple streaming sources.
              We'll find the best quality streams for you.
            </p>
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
            {searchResult && searchResult.totalPages > 1 && (
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
                  {Array.from({ length: Math.min(5, searchResult.totalPages) }).map((_, i) => {
                    let pageNum: number;
                    if (searchResult.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= searchResult.totalPages - 2) {
                      pageNum = searchResult.totalPages - 4 + i;
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
                  disabled={!searchResult.hasNextPage || isFetching}
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
