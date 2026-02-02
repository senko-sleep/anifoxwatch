import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Menu, X, Shuffle, Loader2 } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export const Navbar = () => {
  const navigate = useNavigate();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingRandom, setIsLoadingRandom] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setIsSearchOpen(false);
      setIsMobileMenuOpen(false);
    }
  };

  const handleRandomAnime = async () => {
    setIsLoadingRandom(true);
    try {
      const randomAnime = await apiClient.getRandomAnime();
      if (randomAnime) {
        navigate(`/watch?id=${encodeURIComponent(randomAnime.id)}`);
      }
    } catch (error) {
      console.error('Failed to get random anime:', error);
    } finally {
      setIsLoadingRandom(false);
    }
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex-shrink-0">
          <Logo size="md" />
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-6">
          <Link
            to="/"
            className="text-sm font-medium text-muted-foreground hover:text-fox-orange transition-colors"
          >
            Home
          </Link>
          <Link
            to="/browse"
            className="text-sm font-medium text-muted-foreground hover:text-fox-orange transition-colors"
          >
            Browse
          </Link>
          <button
            onClick={handleRandomAnime}
            disabled={isLoadingRandom}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-fox-orange transition-colors disabled:opacity-50"
          >
            {isLoadingRandom ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Shuffle className="w-4 h-4" />
            )}
            Random
          </button>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-3">
          {/* Desktop Search */}
          <div className={cn(
            "hidden md:flex items-center transition-all duration-300",
            isSearchOpen ? "w-64" : "w-10"
          )}>
            {isSearchOpen ? (
              <form onSubmit={handleSearch} className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search anime..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10 bg-fox-surface border-border focus:border-fox-orange focus:ring-fox-orange/20"
                  autoFocus
                  onBlur={() => !searchQuery && setTimeout(() => setIsSearchOpen(false), 200)}
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setIsSearchOpen(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSearchOpen(true)}
                className="hover:bg-fox-surface hover:text-fox-orange"
              >
                <Search className="w-5 h-5" />
              </Button>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden hover:bg-fox-surface"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-background animate-slide-up">
          <div className="container py-4 space-y-4">
            {/* Mobile Search */}
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search anime..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-fox-surface border-border"
              />
            </form>

            {/* Mobile Nav Links */}
            <div className="flex flex-col gap-2">
              <Link
                to="/"
                className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-fox-surface transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Home
              </Link>
              <Link
                to="/browse"
                className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-fox-surface transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Browse All
              </Link>
              <button
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-fox-surface transition-colors text-left disabled:opacity-50"
                onClick={() => {
                  handleRandomAnime();
                  setIsMobileMenuOpen(false);
                }}
                disabled={isLoadingRandom}
              >
                {isLoadingRandom ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Shuffle className="w-4 h-4" />
                )}
                Random
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};
