import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Anime } from '@/types/anime';
import { cn } from '@/lib/utils';

interface HeroSectionProps {
  featuredAnime: Anime[];
}

export const HeroSection = ({ featuredAnime }: HeroSectionProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const navigate = useNavigate();
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
    <section className="relative w-full h-[75vh] min-h-[600px] overflow-hidden group">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={currentAnime.cover || currentAnime.image}
          alt={currentAnime.title}
          className="w-full h-full object-cover object-top transition-all duration-1000 scale-105 group-hover:scale-100"
        />
        {/* Gradient Overlays - Optimized for visibility */}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative container h-full flex items-center">
        <div className="max-w-2xl space-y-6 animate-fade-in" key={currentAnime.id}>
          {/* Badges */}
          <div className="flex items-center gap-3">
            <div className="px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase rounded bg-fox-orange text-white shadow-lg shadow-fox-orange/20">
              Spotlight #{currentIndex + 1}
            </div>
            <div className="px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase rounded bg-white/10 backdrop-blur-md border border-white/10 text-white/80">
              {currentAnime.type}
            </div>
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-5xl lg:text-7xl font-black leading-tight tracking-tight text-white drop-shadow-2xl">
            {currentAnime.title}
          </h1>

          {/* Description */}
          <p className="text-zinc-300 line-clamp-3 text-base md:text-lg max-w-xl leading-relaxed font-medium">
            {currentAnime.description}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-4 pt-4">
            <Button
              size="lg"
              onClick={() => navigate(`/watch/${currentAnime.id}`)}
              className="bg-white hover:bg-zinc-200 text-black font-bold h-12 px-8 rounded-full gap-2 transition-transform active:scale-95 shadow-xl shadow-white/10"
            >
              <Play className="w-5 h-5 fill-black" />
              Watch Now
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate(`/watch/${currentAnime.id}`)}
              className="bg-white/5 hover:bg-white/10 border-white/20 text-white h-12 px-8 rounded-full gap-2 backdrop-blur-md"
            >
              <Info className="w-5 h-5" />
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
