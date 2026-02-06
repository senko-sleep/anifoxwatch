/**
 * Search Autocomplete Component
 * Provides real-time anime title suggestions as users type
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, X, TrendingUp, Clock } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Anime } from '@/types/anime';

interface SearchSuggestion {
    id: string;
    title: string;
    image?: string;
    type?: string;
    year?: number;
    score?: number;
}

interface SearchAutocompleteProps {
    onSelect: (anime: Anime | SearchSuggestion) => void;
    placeholder?: string;
    className?: string;
    debounceMs?: number;
    maxSuggestions?: number;
}

export const SearchAutocomplete = ({
    onSelect,
    placeholder = 'Search anime...',
    className,
    debounceMs = 300,
    maxSuggestions = 8
}: SearchAutocompleteProps) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    // Load recent searches from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('recentSearches');
        if (saved) {
            try {
                setRecentSearches(JSON.parse(saved));
            } catch {
                setRecentSearches([]);
            }
        }
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch suggestions with debounce
    const fetchSuggestions = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim() || searchQuery.length < 2) {
            setSuggestions([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const result = await apiClient.search(searchQuery, 1, undefined, 'safe');
            const mappedSuggestions: SearchSuggestion[] = result.results.slice(0, maxSuggestions).map(anime => ({
                id: anime.id,
                title: anime.title,
                image: anime.image,
                type: anime.type,
                year: anime.year,
                score: anime.rating
            }));
            setSuggestions(mappedSuggestions);
        } catch (error) {
            console.error('Search suggestions failed:', error);
            setSuggestions([]);
        } finally {
            setIsLoading(false);
        }
    }, [maxSuggestions]);

    // Handle input change with debounce
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setQuery(value);
        setSelectedIndex(-1);

        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        if (value.trim()) {
            setIsOpen(true);
            debounceTimer.current = setTimeout(() => {
                fetchSuggestions(value);
            }, debounceMs);
        } else {
            setSuggestions([]);
            setIsOpen(false);
        }
    };

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        const totalItems = suggestions.length + (query ? 0 : recentSearches.length);

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => (prev < totalItems - 1 ? prev + 1 : 0));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => (prev > 0 ? prev - 1 : totalItems - 1));
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0) {
                    handleSelectAtIndex(selectedIndex);
                } else if (query.trim()) {
                    handleSubmit();
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setSelectedIndex(-1);
                break;
        }
    };

    const handleSelectAtIndex = (index: number) => {
        if (index < suggestions.length) {
            const suggestion = suggestions[index];
            handleSelect(suggestion);
        } else {
            const recentIndex = index - suggestions.length;
            if (recentIndex < recentSearches.length) {
                const recent = recentSearches[recentIndex];
                setQuery(recent);
                fetchSuggestions(recent);
            }
        }
    };

    const handleSelect = (suggestion: SearchSuggestion) => {
        // Add to recent searches
        const updatedRecent = [suggestion.title, ...recentSearches.filter(s => s !== suggestion.title)].slice(0, 5);
        setRecentSearches(updatedRecent);
        localStorage.setItem('recentSearches', JSON.stringify(updatedRecent));

        setQuery(suggestion.title);
        setIsOpen(false);
        setSelectedIndex(-1);
        onSelect(suggestion);
    };

    const handleSubmit = () => {
        if (query.trim()) {
            // Add to recent searches
            const updatedRecent = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
            setRecentSearches(updatedRecent);
            localStorage.setItem('recentSearches', JSON.stringify(updatedRecent));

            setIsOpen(false);
            setSelectedIndex(-1);
            onSelect({ id: '', title: query });
        }
    };

    const clearSearch = () => {
        setQuery('');
        setSuggestions([]);
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.focus();
    };

    const showRecentSearches = !query && recentSearches.length > 0;
    const showSuggestions = isOpen && (suggestions.length > 0 || isLoading);

    return (
        <div ref={containerRef} className={cn('relative w-full', className)}>
            {/* Search Input */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => query && setIsOpen(true)}
                    placeholder={placeholder}
                    className="w-full pl-10 pr-10 py-2 bg-fox-surface border border-border rounded-lg text-sm focus:outline-none focus:border-fox-orange focus:ring-1 focus:ring-fox-orange/20 transition-all"
                    aria-label="Search anime"
                    aria-autocomplete="list"
                    aria-expanded={isOpen}
                    aria-controls="search-results"
                />
                {isLoading && (
                    <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                )}
                {query && (
                    <button
                        onClick={clearSearch}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Clear search"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {showSuggestions && (
                <div 
                    id="search-results"
                    className="absolute z-50 w-full mt-2 bg-fox-surface border border-border rounded-xl shadow-xl overflow-hidden animate-in slide-in-from-top-2 duration-200"
                >
                    {isLoading ? (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                            <span className="mt-2 block">Searching...</span>
                        </div>
                    ) : (
                        <>
                            {/* Suggestions */}
                            {suggestions.length > 0 && (
                                <div className="py-2">
                                    <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Results
                                    </div>
                                    {suggestions.map((suggestion, index) => (
                                        <button
                                            key={suggestion.id}
                                            onClick={() => handleSelect(suggestion)}
                                            className={cn(
                                                'w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-white/5 transition-colors',
                                                selectedIndex === index && 'bg-white/5'
                                            )}
                                        >
                                            {suggestion.image && (
                                                <img 
                                                    src={suggestion.image} 
                                                    alt=""
                                                    className="w-10 h-14 object-cover rounded flex-shrink-0"
                                                />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm text-foreground line-clamp-1">
                                                    {suggestion.title}
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {suggestion.type && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {suggestion.type}
                                                        </span>
                                                    )}
                                                    {suggestion.year && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {suggestion.year}
                                                        </span>
                                                    )}
                                                    {suggestion.score && (
                                                        <span className="text-xs text-amber-400">
                                                            ★ {suggestion.score.toFixed(1)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Recent Searches */}
                            {showRecentSearches && suggestions.length === 0 && (
                                <div className="py-2">
                                    <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                        <Clock className="w-3 h-3" />
                                        Recent Searches
                                    </div>
                                    {recentSearches.map((recent, index) => (
                                        <button
                                            key={recent}
                                            onClick={() => {
                                                setQuery(recent);
                                                fetchSuggestions(recent);
                                            }}
                                            className={cn(
                                                'w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-white/5 transition-colors',
                                                selectedIndex === suggestions.length + index && 'bg-white/5'
                                            )}
                                        >
                                            <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                            <span className="text-sm text-foreground line-clamp-1">
                                                {recent}
                                            </span>
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => {
                                            setRecentSearches([]);
                                            localStorage.removeItem('recentSearches');
                                        }}
                                        className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        Clear recent searches
                                    </button>
                                </div>
                            )}

                            {/* No Results */}
                            {!isLoading && suggestions.length === 0 && query && (
                                <div className="p-4 text-center text-muted-foreground text-sm">
                                    No anime found for "{query}"
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default SearchAutocomplete;
