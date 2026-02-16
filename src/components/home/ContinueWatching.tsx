import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Play, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { WatchHistoryItem } from '@/lib/watch-history';
import { Button } from '@/components/ui/button';

interface ContinueWatchingProps {
    items: WatchHistoryItem[];
    onRemove: (id: string) => void;
}

export const ContinueWatching = ({ items, onRemove }: ContinueWatchingProps) => {
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

    if (!items || items.length === 0) return null;

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
                className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-4 -mb-4 -mx-1 px-1"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
            >
                {items.map((item) => (
                    <Link
                        key={item.animeId}
                        to={`/watch?id=${encodeURIComponent(item.animeId)}&ep=${item.episodeNumber}`}
                        state={{ from: location.pathname + location.search }}
                        className="shrink-0 w-48 sm:w-56 group/card touch-manipulation"
                    >
                        <div className="relative aspect-video rounded-xl overflow-hidden bg-fox-surface shadow-lg">
                            {/* Main image: frame thumbnail if available, otherwise anime poster */}
                            <img
                                src={item.frameThumbnail || item.animeImage}
                                alt={item.animeTitle}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                                loading="lazy"
                            />

                            {/* Gradient overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                            {/* Small anime poster icon in bottom-left corner */}
                            <div className="absolute bottom-8 left-2 w-10 h-14 rounded-md overflow-hidden shadow-lg ring-1 ring-white/20">
                                <img
                                    src={item.animeImage}
                                    alt={item.animeTitle}
                                    className="w-full h-full object-cover"
                                />
                            </div>

                            {/* Hover play button */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all duration-300">
                                <div className="w-12 h-12 rounded-full bg-fox-orange/90 flex items-center justify-center transform scale-0 group-hover/card:scale-100 transition-transform duration-300 shadow-xl">
                                    <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                                </div>
                            </div>

                            {/* Progress bar */}
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                                <div
                                    className="h-full bg-fox-orange rounded-full"
                                    style={{ width: `${Math.min(100, item.progress * 100)}%` }}
                                />
                            </div>

                            {/* Episode info overlay */}
                            <div className="absolute bottom-2 left-14 right-3 flex items-center justify-between">
                                <span className="text-xs font-medium text-white/90">
                                    EP {item.episodeNumber}
                                </span>
                                <span className="text-xs text-white/60">
                                    {Math.floor((item.duration - item.timestamp) / 60)}m left
                                </span>
                            </div>

                            {/* Remove button */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover/card:opacity-100 transition-opacity bg-black/50 hover:bg-red-500/80 hover:text-white text-white/70 rounded-full"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onRemove(item.animeId);
                                }}
                                title="Remove from history"
                            >
                                <X className="w-3.5 h-3.5" />
                            </Button>
                        </div>

                        <div className="mt-2 sm:mt-2.5">
                            <h3 className="font-medium text-xs sm:text-sm line-clamp-1 group-hover/card:text-fox-orange transition-colors">
                                {item.animeTitle}
                            </h3>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
};
