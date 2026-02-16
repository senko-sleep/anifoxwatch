import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Play, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { Anime } from '@/types/anime';
import { cn, formatRating } from '@/lib/utils';

interface WeeklyLeaderboardProps {
    anime: Anime[];
    isLoading?: boolean;
}

export const WeeklyLeaderboard = ({ anime, isLoading }: WeeklyLeaderboardProps) => {
    const location = useLocation();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    const checkScroll = () => {
        if (!scrollRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        setCanScrollLeft(scrollLeft > 0);
        setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    };

    const scroll = (direction: 'left' | 'right') => {
        if (!scrollRef.current) return;
        const scrollAmount = scrollRef.current.clientWidth * 0.8;
        scrollRef.current.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth'
        });
        setTimeout(checkScroll, 300);
    };

    if (isLoading) {
        return (
            <div className="flex gap-4 overflow-hidden">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="shrink-0 w-[220px] aspect-[3/4] rounded-xl bg-fox-surface animate-pulse" />
                ))}
            </div>
        );
    }

    if (!anime || anime.length === 0) return null;

    return (
        <div className="relative group/slider">
            {canScrollLeft && (
                <button
                    onClick={() => scroll('left')}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-fox-orange/90 backdrop-blur-sm flex items-center justify-center text-white shadow-lg opacity-0 group-hover/slider:opacity-100 transition-all hover:bg-fox-orange hover:scale-110 -translate-x-1/2"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
            )}
            {canScrollRight && (
                <button
                    onClick={() => scroll('right')}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-fox-orange/90 backdrop-blur-sm flex items-center justify-center text-white shadow-lg opacity-0 group-hover/slider:opacity-100 transition-all hover:bg-fox-orange hover:scale-110 translate-x-1/2"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            )}

            <div
                ref={scrollRef}
                onScroll={checkScroll}
                className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth pb-4 -mb-4"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {anime.slice(0, 10).map((item, index) => {
                    const rank = index + 1;
                    return (
                        <Link
                            key={item.id}
                            to={`/watch?id=${encodeURIComponent(item.id)}`}
                            state={{ from: location.pathname + location.search }}
                            className="shrink-0 group/card relative flex items-end"
                        >
                            {/* Large rank number */}
                            <div className="relative z-10 -mr-4 mb-1 select-none pointer-events-none">
                                <span
                                    className={cn(
                                        "font-black leading-none",
                                        "text-[7rem] sm:text-[8rem]",
                                        rank <= 3
                                            ? "text-transparent bg-clip-text bg-gradient-to-b from-fox-orange to-fox-orange-dark"
                                            : "text-transparent bg-clip-text bg-gradient-to-b from-zinc-600 to-zinc-800"
                                    )}
                                    style={{
                                        WebkitTextStroke: rank <= 3 ? '2px hsl(28 95% 45%)' : '2px hsl(220 15% 25%)',
                                    }}
                                >
                                    {rank}
                                </span>
                            </div>

                            {/* Poster card */}
                            <div className="relative w-36 sm:w-40 aspect-[2/3] rounded-xl overflow-hidden bg-fox-surface shadow-lg">
                                <img
                                    src={item.image}
                                    alt={item.title}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                                    loading="lazy"
                                />

                                {/* Gradient */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                                {/* Hover play */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all duration-300">
                                    <div className="w-14 h-14 rounded-full bg-fox-orange/90 flex items-center justify-center transform scale-0 group-hover/card:scale-100 transition-transform duration-300 shadow-xl">
                                        <Play className="w-7 h-7 text-white fill-white ml-1" />
                                    </div>
                                </div>

                                {/* Rating */}
                                {item.rating && (
                                    <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm text-xs font-medium">
                                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                        <span className="text-white">{formatRating(item.rating)}</span>
                                    </div>
                                )}

                                {/* Title at bottom */}
                                <div className="absolute bottom-0 left-0 right-0 p-3">
                                    <h3 className="font-semibold text-sm text-white line-clamp-2 leading-tight">
                                        {item.title}
                                    </h3>
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
};
