import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Clock, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { ScheduleItem } from '@/lib/api-client';

interface AiringScheduleProps {
    schedule: ScheduleItem[];
    isLoading?: boolean;
}

export const AiringSchedule = ({ schedule, isLoading }: AiringScheduleProps) => {
    const location = useLocation();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    const formatTimeUntil = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

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
                {[...Array(8)].map((_, i) => (
                    <div key={i} className="w-44 shrink-0 aspect-[2/3] rounded-xl bg-fox-surface animate-pulse" />
                ))}
            </div>
        );
    }

    if (!schedule || schedule.length === 0) return null;

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
                className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-4 -mb-4"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {schedule.map((item) => (
                    <Link
                        key={item.id}
                        to={`/watch?id=${encodeURIComponent(item.id)}`}
                        state={{ from: location.pathname + location.search }}
                        className="shrink-0 w-44 group/card"
                    >
                        <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-fox-surface shadow-lg">
                            <img
                                src={item.media?.thumbnail}
                                alt={item.title}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                                loading="lazy"
                            />

                            {/* Gradient overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                            {/* Hover play button */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all duration-300">
                                <div className="w-14 h-14 rounded-full bg-fox-orange/90 flex items-center justify-center transform scale-0 group-hover/card:scale-100 transition-transform duration-300 shadow-xl">
                                    <Play className="w-7 h-7 text-white fill-white ml-1" />
                                </div>
                            </div>

                            {/* Episode badge */}
                            <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-fox-orange/90 backdrop-blur-sm text-xs font-semibold text-white">
                                EP {item.episode}
                            </div>

                            {/* Countdown overlay */}
                            <div className="absolute bottom-0 left-0 right-0 p-3">
                                <div className="flex items-center gap-1.5 text-xs text-white/90">
                                    <Clock className="w-3.5 h-3.5 text-fox-orange" />
                                    <span className="font-medium">{formatTimeUntil(item.timeUntilAiring)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-3 space-y-1">
                            <h3 className="font-medium text-sm line-clamp-2 group-hover/card:text-fox-orange transition-colors">
                                {item.title}
                            </h3>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
};
