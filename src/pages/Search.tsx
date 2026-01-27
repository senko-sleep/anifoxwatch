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
  Filter, 
  SlidersHorizontal,
  X,
  ArrowUpDown,
  Loader2,
  Sparkles
} from 'lucide-react';
import { Anime } from '@/types/anime';

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
        // Keep original order (relevance)
        break;
    }

    return results;
  }, [searchResult?.results, typeFilter, statusFilter, sortBy]);

  // Auto-naming: Clean up and format anime titles
  const formatTitle = (title: string): string => {
    return title
      .replace(/\s+/g, ' ')
      .replace(/\(TV\)|\(OVA\)|\(ONA\)/gi, '')
      .trim();
  };

  // Clear all filters
  const clearFilters = () => {
    setTypeFilter('all');
    setStatusFilter('all');
    setSortBy('relevance');
  };

  const hasActiveFilters = typeFilter !== 'all' || statusFilter !== 'all' || sortBy !== 'relevance';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 container py-8">
        {/* Search Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-fox-orange to-orange-400 bg-clip-text text-transparent">
            Search Anime
          </h1>
          <p className="text-muted-foreground">
            Find your favorite anime from multiple sources
          </p>
        </div>

        {/* Search Input */}
        <div className="relative mb-6">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search for anime..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-12 pr-12 h-14 text-lg bg-fox-surface/50 border-fox-surface focus:border-fox-orange"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Filters Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? 'bg-fox-orange hover:bg-fox-orange/90' : ''}
          >
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filters
            {hasActiveFilters && (
              <Badge className="ml-2 bg-white/20">Active</Badge>
            )}
          </Button>

          {/* Quick filters */}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-36 bg-fox-surface/50">
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

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-muted-foreground"
            >
              <X className="w-4 h-4 mr-1" />
              Clear filters
            </Button>
          )}

          {/* Results count */}
          {searchResult && (
            <div className="ml-auto text-sm text-muted-foreground">
              {filteredResults.length} results
              {searchResult.totalPages > 1 && ` • Page ${page} of ${searchResult.totalPages}`}
            </div>
          )}
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="p-4 mb-6 bg-fox-surface/30 rounded-xl space-y-4 animate-in slide-in-from-top-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Type</label>
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                  <SelectTrigger className="bg-background/50">
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
                <label className="text-sm font-medium mb-2 block">Status</label>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger className="bg-background/50">
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
          // Empty state
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-fox-surface flex items-center justify-center mb-6">
              <Sparkles className="w-10 h-10 text-fox-orange" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Start Searching</h2>
            <p className="text-muted-foreground max-w-md">
              Enter an anime title to search across multiple streaming sources.
              We'll find the best quality streams for you.
            </p>
          </div>
        ) : debouncedQuery.length < 2 ? (
          <div className="text-center py-12 text-muted-foreground">
            Type at least 2 characters to search
          </div>
        ) : isLoading ? (
          // Loading state
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[3/4] rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredResults.length === 0 ? (
          // No results
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-fox-surface flex items-center justify-center mb-6">
              <SearchIcon className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No Results Found</h2>
            <p className="text-muted-foreground max-w-md">
              We couldn't find any anime matching "{debouncedQuery}".
              Try a different search term or adjust your filters.
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                onClick={clearFilters}
                className="mt-4"
              >
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          // Results grid
          <>
            <AnimeGrid anime={filteredResults} />

            {/* Pagination */}
            {searchResult && searchResult.totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-8">
                <Button
                  variant="outline"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || isFetching}
                >
                  Previous
                </Button>
                
                <span className="text-sm text-muted-foreground">
                  Page {page} of {searchResult.totalPages}
                </span>
                
                <Button
                  variant="outline"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!searchResult.hasNextPage || isFetching}
                >
                  {isFetching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Next'
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
