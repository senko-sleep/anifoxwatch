import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Menu, X, Shuffle, Users } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const Navbar = () => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
            to="/browse" 
            className="text-sm font-medium text-muted-foreground hover:text-fox-orange transition-colors"
          >
            Browse
          </Link>
          <Link 
            to="/genres" 
            className="text-sm font-medium text-muted-foreground hover:text-fox-orange transition-colors"
          >
            Genres
          </Link>
          <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-fox-orange transition-colors">
            <Shuffle className="w-4 h-4" />
            Random
          </button>
          <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-fox-orange transition-colors">
            <Users className="w-4 h-4" />
            Community
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
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search anime..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10 bg-fox-surface border-border focus:border-fox-orange focus:ring-fox-orange/20"
                  autoFocus
                  onBlur={() => !searchQuery && setIsSearchOpen(false)}
                />
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setIsSearchOpen(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
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

          {/* Login Button */}
          <Button 
            variant="outline" 
            className="hidden sm:flex border-fox-orange text-fox-orange hover:bg-fox-orange hover:text-white"
          >
            Login
          </Button>

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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search anime..."
                className="pl-10 bg-fox-surface border-border"
              />
            </div>

            {/* Mobile Nav Links */}
            <div className="flex flex-col gap-2">
              <Link 
                to="/browse" 
                className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-fox-surface transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Browse
              </Link>
              <Link 
                to="/genres" 
                className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-fox-surface transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Genres
              </Link>
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-fox-surface transition-colors text-left">
                <Shuffle className="w-4 h-4" />
                Random
              </button>
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-fox-surface transition-colors text-left">
                <Users className="w-4 h-4" />
                Community
              </button>
            </div>

            {/* Mobile Login */}
            <Button className="w-full bg-fox-orange hover:bg-fox-orange-dark text-white">
              Login
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
};
