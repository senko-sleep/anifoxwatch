import { useState, useEffect } from 'react';
import { Play, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Anime } from '@/types/anime';
import { cn } from '@/lib/utils';

interface HeroSectionProps {
  featuredAnime: Anime[];
}

export const HeroSection = ({ featuredAnime }: HeroSectionProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentAnime = featuredAnime[currentIndex];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % featuredAnime.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [featuredAnime.length]);

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + featuredAnime.length) % featuredAnime.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % featuredAnime.length);
  };

  if (!currentAnime) return null;

  return (
    <section className="relative w-full h-[50vh] min-h-[400px] max-h-[600px] overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={currentAnime.cover || currentAnime.image}
          alt={currentAnime.title}
          className="w-full h-full object-cover object-center"
        />
        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative container h-full flex items-center">
        <div className="max-w-xl space-y-4 animate-fade-in" key={currentAnime.id}>
          {/* Badges */}
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 text-xs font-medium rounded bg-fox-orange text-white">
              #{currentIndex + 1} Spotlight
            </span>
            <span className="px-2 py-1 text-xs font-medium rounded bg-fox-surface">
              {currentAnime.type}
            </span>
            {currentAnime.status === 'Ongoing' && (
              <span className="px-2 py-1 text-xs font-medium rounded bg-badge-dub/20 text-badge-dub">
                Ongoing
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
            {currentAnime.title}
          </h1>

          {/* Description */}
          <p className="text-muted-foreground line-clamp-3 text-sm md:text-base">
            {currentAnime.description}
          </p>

          {/* Genres */}
          <div className="flex flex-wrap gap-2">
            {currentAnime.genres.slice(0, 4).map((genre) => (
              <span
                key={genre}
                className="px-3 py-1 text-xs rounded-full bg-fox-surface/80 text-muted-foreground"
              >
                {genre}
              </span>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button className="bg-fox-orange hover:bg-fox-orange-dark text-white gap-2 glow-orange">
              <Play className="w-4 h-4 fill-white" />
              Watch Now
            </Button>
            <Button variant="outline" className="border-border hover:bg-fox-surface gap-2">
              <Info className="w-4 h-4" />
              Details
            </Button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="absolute bottom-6 right-6 flex items-center gap-2">
        <button
          onClick={goToPrev}
          className="p-2 rounded-full bg-fox-surface/80 hover:bg-fox-orange/80 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1 px-3">
          {featuredAnime.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={cn(
                'w-2 h-2 rounded-full transition-all',
                idx === currentIndex ? 'bg-fox-orange w-6' : 'bg-fox-surface hover:bg-muted-foreground'
              )}
            />
          ))}
        </div>
        <button
          onClick={goToNext}
          className="p-2 rounded-full bg-fox-surface/80 hover:bg-fox-orange/80 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
};
