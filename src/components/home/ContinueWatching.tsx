import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Play, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { WatchHistoryItem } from '@/lib/watch-history';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ensureHttps } from '@/lib/utils';

interface ContinueWatchingProps {
    items: WatchHistoryItem[];
    onRemove: (id: string) => void;
}

type ImagePhase = 'primary' | 'poster' | 'none';

function pickMainSrc(item: WatchHistoryItem, phase: ImagePhase | undefined): string {
    const poster = ensureHttps(item.animeImage);
    const frameRaw = item.frameThumbnail?.trim();
    const frame = frameRaw ? ensureHttps(frameRaw) : '';

    if (phase === 'none') return '';
    if (phase === 'poster' || !frame) return poster;
    return frame || poster;
}

export const ContinueWatching = ({ items, onRemove }: ContinueWatchingProps) => {
    const location = useLocation();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    /** Per anime: episode still → poster only → hide broken layer */
    const [heroPhase, setHeroPhase] = useState<Record<string, ImagePhase>>({});
    const [posterDead, setPosterDead] = useState<Record<string, boolean>>({});

    const coverSignature = useMemo(
        () => items.map((i) => `${i.animeId}\u001f${i.animeImage}\u001f${i.frameThumbnail ?? ''}`).join('\u0002'),
        [items]
    );

    useEffect(() => {
        setHeroPhase({});
        setPosterDead({});
    }, [coverSignature]);

    const onHeroError = useCallback((animeId: string, item: WatchHistoryItem) => {
        setHeroPhase((prev) => {
            const cur = prev[animeId];
            const hasFrame = !!(item.frameThumbnail?.trim());
            if (hasFrame && cur !== 'poster' && cur !== 'none') {
                return { ...prev, [animeId]: 'poster' };
            }
            return { ...prev, [animeId]: 'none' };
        });
    }, []);

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
                {items.map((item, index) => {
                    const phase = heroPhase[item.animeId];
                    const mainSrc = pickMainSrc(item, phase);
                    const posterSrc = ensureHttps(item.animeImage);
                    const showHeroImg = mainSrc.length > 0 && phase !== 'none';
                    const eager = index < 6;

                    return (
                    <Link
                        key={item.animeId}
                        to={`/watch?id=${encodeURIComponent(item.animeId)}&ep=${item.episodeNumber}${item.source ? `&source=${encodeURIComponent(item.source)}` : ''}`}
                        state={{ from: location.pathname + location.search }}
                        className="shrink-0 w-48 sm:w-56 group/card touch-manipulation"
                    >
                        <div className="relative aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 shadow-lg ring-1 ring-white/5">
                            {showHeroImg ? (
                                <img
                                    key={`hero-${item.animeId}-${mainSrc.slice(-48)}`}
                                    src={mainSrc}
                                    alt={item.animeTitle}
                                    loading={eager ? 'eager' : 'lazy'}
                                    {...(eager ? { fetchPriority: 'high' as const } : {})}
                                    decoding="async"
                                    referrerPolicy="no-referrer"
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                                    onError={() => onHeroError(item.animeId, item)}
                                />
                            ) : null}

                            {/* Gradient overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />

                            {/* Small anime poster */}
                            {!posterDead[item.animeId] && posterSrc ? (
                                <div className="absolute bottom-8 left-2 w-10 h-14 rounded-md overflow-hidden shadow-lg ring-1 ring-white/20 z-10 bg-zinc-800">
                                    <img
                                        key={`poster-${item.animeId}-${posterSrc.slice(-48)}`}
                                        src={posterSrc}
                                        alt=""
                                        aria-hidden
                                        loading={eager ? 'eager' : 'lazy'}
                                        {...(eager ? { fetchPriority: 'high' as const } : {})}
                                        decoding="async"
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover"
                                        onError={() =>
                                            setPosterDead((p) => ({ ...p, [item.animeId]: true }))
                                        }
                                    />
                                </div>
                            ) : null}

                            {/* Hover play button */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 pointer-events-none">
                                <div className="w-12 h-12 rounded-full bg-fox-orange/90 flex items-center justify-center transform scale-0 group-hover/card:scale-100 transition-transform duration-300 shadow-xl">
                                    <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                                </div>
                            </div>

                            {/* Progress bar */}
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-10">
                                <div
                                    className="h-full bg-fox-orange rounded-full"
                                    style={{ width: `${Math.min(100, item.progress * 100)}%` }}
                                />
                            </div>

                            {/* Episode badge - top left */}
                            <div className="absolute top-2 left-2 z-10">
                                <Badge className="bg-fox-orange/90 hover:bg-fox-orange text-white text-[10px] font-medium px-2 py-0.5 backdrop-blur-sm border-0">
                                    EP {item.episodeNumber}
                                </Badge>
                            </div>

                            {/* Time left - bottom right */}
                            {item.duration > 0 && item.timestamp < item.duration && (
                                <div className="absolute bottom-2 right-2 z-10">
                                    <span className="text-[10px] text-white/60 bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm">
                                        {Math.max(0, Math.floor((item.duration - item.timestamp) / 60))}m left
                                    </span>
                                </div>
                            )}

                            {/* Remove button — always visible on mobile, hover-only on desktop */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 z-10 h-7 w-7 opacity-60 sm:opacity-0 sm:group-hover/card:opacity-100 transition-opacity bg-black/50 hover:bg-red-500/80 hover:text-white text-white/70 rounded-full"
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
                    );
                })}
            </div>
        </div>
    );
};
