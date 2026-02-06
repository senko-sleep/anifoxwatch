import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, X, Play, Star, Clock, TrendingUp, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { cn, normalizeRating } from '@/lib/utils';

interface SearchResult {
  id: string;
  title: string;
  image: string;
  type?: string;
  status?: string;
  rating?: number;
  genres?: string[];
  subCount?: number;
  dubCount?: number;
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
  const localInputRef = useRef<HTMLInputElement>(null);
  const effectiveInputRef = inputRef || localInputRef;

  // Debounced search
  const performSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setShowDropdown(q.length > 0);
      return;
    }

    setIsLoading(true);
    try {
      const data = await apiClient.search(q, 1);
      setResults((data.results || []).slice(0, 8));
      setShowDropdown(true);
    } catch {
      setResults([]);
    } finally {
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
    debounceRef.current = setTimeout(() => performSearch(query), 300);
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
    <div ref={containerRef} className={cn("relative", className)}>
      <form onSubmit={handleSubmit} className="relative">
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
          className="pl-10 pr-10 bg-fox-surface border-border focus:border-fox-orange focus:ring-fox-orange/20"
          autoFocus
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]); setShowDropdown(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
          "absolute top-full left-0 right-0 mt-2 bg-fox-surface/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50",
          isMobile ? "max-h-[60vh]" : "max-h-[400px]"
        )}>
          {/* Results */}
          {results.length > 0 ? (
            <div className="overflow-y-auto max-h-[340px]">
              {results.map((result, i) => {
                const rating = normalizeRating(result.rating);
                return (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      selectedIndex === i ? "bg-fox-orange/10" : "hover:bg-white/5"
                    )}
                  >
                    {/* Thumbnail */}
                    <div className="w-10 h-14 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
                      <img
                        src={result.image}
                        alt={result.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{result.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {result.type && (
                          <span className="text-[10px] text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                            {result.type}
                          </span>
                        )}
                        {rating && rating >= 1 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                            <Star className="w-2.5 h-2.5 fill-amber-400" />
                            {rating.toFixed(1)}
                          </span>
                        )}
                        {result.subCount && result.subCount > 0 && (
                          <span className="text-[10px] text-zinc-500">
                            {result.subCount} eps
                          </span>
                        )}
                        {result.genres && result.genres.length > 0 && (
                          <span className="text-[10px] text-zinc-500 truncate">
                            {result.genres.slice(0, 2).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Play icon */}
                    <Play className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                  </button>
                );
              })}

              {/* View all results link */}
              <button
                onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
                className="w-full px-3 py-2.5 text-center text-xs text-fox-orange hover:bg-fox-orange/10 transition-colors border-t border-white/5"
              >
                View all results for "{query}"
              </button>
            </div>
          ) : query.length >= 2 && !isLoading ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-zinc-400">No results found for "{query}"</p>
              <p className="text-xs text-zinc-500 mt-1">Try a different search term</p>
            </div>
          ) : query.length < 2 ? (
            /* Popular searches when typing starts */
            <div className="p-3">
              <div className="flex items-center gap-2 px-1 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-fox-orange" />
                <span className="text-xs font-medium text-zinc-400">Popular Searches</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_SEARCHES.map(term => (
                  <button
                    key={term}
                    onClick={() => handlePopularClick(term)}
                    className="px-2.5 py-1.5 text-xs text-zinc-300 bg-zinc-800/60 hover:bg-fox-orange/10 hover:text-fox-orange rounded-lg transition-colors border border-white/5"
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
