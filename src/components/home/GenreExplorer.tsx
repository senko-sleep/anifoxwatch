import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const GENRES = [
  { name: 'Action', color: 'from-red-500 to-orange-500', icon: '⚔️' },
  { name: 'Romance', color: 'from-pink-500 to-rose-500', icon: '💕' },
  { name: 'Comedy', color: 'from-yellow-500 to-amber-500', icon: '😂' },
  { name: 'Fantasy', color: 'from-purple-500 to-violet-500', icon: '🔮' },
  { name: 'Sci-Fi', color: 'from-cyan-500 to-blue-500', icon: '🚀' },
  { name: 'Horror', color: 'from-gray-700 to-gray-900', icon: '👻' },
  { name: 'Slice of Life', color: 'from-green-500 to-emerald-500', icon: '🌸' },
  { name: 'Sports', color: 'from-orange-500 to-red-500', icon: '⚽' },
  { name: 'Mystery', color: 'from-indigo-500 to-purple-500', icon: '🔍' },
  { name: 'Supernatural', color: 'from-violet-500 to-fuchsia-500', icon: '✨' },
  { name: 'Drama', color: 'from-blue-500 to-indigo-500', icon: '🎭' },
  { name: 'Adventure', color: 'from-teal-500 to-cyan-500', icon: '🗺️' },
];

export const GenreExplorer = () => {
  const [hoveredGenre, setHoveredGenre] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fox-orange to-orange-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Explore by Genre</h2>
            <p className="text-sm text-muted-foreground">Find your next favorite anime</p>
          </div>
        </div>
        <Link 
          to="/browse" 
          className="flex items-center gap-1 text-sm text-fox-orange hover:underline"
        >
          All Genres <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {GENRES.map((genre) => (
          <Link
            key={genre.name}
            to={`/browse?genre=${encodeURIComponent(genre.name)}`}
            className="group relative"
            onMouseEnter={() => setHoveredGenre(genre.name)}
            onMouseLeave={() => setHoveredGenre(null)}
          >
            <div className={cn(
              "relative h-24 rounded-xl overflow-hidden transition-all duration-300",
              "bg-gradient-to-br",
              genre.color,
              hoveredGenre === genre.name ? "scale-105 shadow-xl" : "shadow-md"
            )}>
              {/* Animated Background Pattern */}
              <div className="absolute inset-0 opacity-20">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.4),transparent_70%)]" />
              </div>

              {/* Content */}
              <div className="relative h-full flex flex-col items-center justify-center gap-1 p-3">
                <span className="text-2xl transform transition-transform duration-300 group-hover:scale-125">
                  {genre.icon}
                </span>
                <span className="text-white font-semibold text-sm text-center">
                  {genre.name}
                </span>
              </div>

              {/* Hover Glow */}
              <div className={cn(
                "absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-300",
                hoveredGenre === genre.name && "opacity-100"
              )} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};
