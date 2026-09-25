import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Play, X } from 'lucide-react';
import type { WatchHistoryItem } from '@/lib/watch-history';
import { cn, ensureHttps } from '@/lib/utils';
import { watchPath } from '@/lib/routes';

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

function timeLeftLabel(item: WatchHistoryItem): string | null {
    if (!(item.duration > 0) || item.timestamp >= item.duration) return null;
    const mins = Math.max(1, Math.round((item.duration - item.timestamp) / 60));
    return `${mins} min left`;
}

/**
 * The shelf that picks up where the viewer stopped. Wide stills instead of
 * posters, because a frame from the episode is the strongest reminder of
 * where you were — the poster stays as a small anchor in the corner.
 */
export const ContinueWatching = ({ items, onRemove }: ContinueWatchingProps) => {
    const location = useLocation();
    const scrollRef = useRef<HTMLDivElement>(null);
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
            const hasFrame = !!item.frameThumbnail?.trim();
            if (hasFrame && cur !== 'poster' && cur !== 'none') return { ...prev, [animeId]: 'poster' };
            return { ...prev, [animeId]: 'none' };
        });
    }, []);

    if (!items?.length) return null;

    return (
        <div
            ref={scrollRef}
            className="scrollbar-hide -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2"
            style={{ WebkitOverflowScrolling: 'touch' }}
        >
                {items.map((item, index) => {
                    const phase = heroPhase[item.animeId];
                    const mainSrc = pickMainSrc(item, phase);
                    const posterSrc = ensureHttps(item.animeImage);
                    const showHero = mainSrc.length > 0 && phase !== 'none';
                    const eager = index < 4;
                    const left = timeLeftLabel(item);

                    return (
                        <Link
                            key={item.animeId}
                            to={watchPath(
                                { id: item.animeId, title: item.animeTitle, source: item.source },
                                item.episodeNumber
                            )}
                            state={{ from: location.pathname + location.search }}
                            className="group w-[15rem] shrink-0 snap-start sm:w-[17.5rem]"
                        >
                            <div className="home-continue-card art-frame relative aspect-video w-full transition-transform duration-300 ease-glide group-hover:z-10 group-hover:scale-[1.035]">
                                {showHero ? (
                                    <img
                                        key={`hero-${item.animeId}-${mainSrc.slice(-48)}`}
                                        src={mainSrc}
                                        alt=""
                                        loading={eager ? 'eager' : 'lazy'}
                                        decoding="async"
                                        referrerPolicy="no-referrer"
                                         className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-glide group-hover:scale-[1.04]"
                                        onError={() => onHeroError(item.animeId, item)}
                                    />
                                ) : (
                                    <div className="absolute inset-0 bg-[hsl(234_22%_11%)]" />
                                )}

                                <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[hsl(234_32%_3%_/_0.35)] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                                    <div className="grid h-11 w-11 place-items-center rounded-full bg-white/90 shadow-lg">
                                        <Play className="h-[18px] w-[18px] translate-x-0.5 fill-[hsl(234_32%_8%)] text-[hsl(234_32%_8%)]" />
                                    </div>
                                </div>

                                <div className="home-continue-scrim absolute inset-x-0 bottom-0 h-2/3" />

                                {!posterDead[item.animeId] && posterSrc && (
                                    <div className="absolute bottom-3 left-3 z-10 h-14 w-10 overflow-hidden rounded-md shadow-lg ring-1 ring-white/25">
                                        <img
                                            key={`poster-${item.animeId}-${posterSrc.slice(-48)}`}
                                            src={posterSrc}
                                            alt=""
                                            aria-hidden
                                            loading={eager ? 'eager' : 'lazy'}
                                            decoding="async"
                                            referrerPolicy="no-referrer"
                                            className="h-full w-full object-cover"
                                            onError={() => setPosterDead((p) => ({ ...p, [item.animeId]: true }))}
                                        />
                                    </div>
                                )}

                                <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 py-3 pl-16 pr-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-[13px] font-medium text-foreground">{item.animeTitle}</p>
                                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                            Episode {item.episodeNumber}
                                            {left ? ` · ${left}` : ''}
                                        </p>
                                    </div>
                                </div>

                                <div className="absolute inset-x-0 bottom-0 z-20 h-[3px] bg-[hsl(236_34%_4%_/_0.6)]">
                                    <div
                                        className="h-full rounded-r-full bg-[hsl(var(--primary))]"
                                        style={{ width: `${Math.min(100, Math.round(item.progress * 100))}%` }}
                                    />
                                </div>

                                <button
                                    type="button"
                                    aria-label={`Remove ${item.animeTitle} from Continue watching`}
                                    className="glass-chip absolute right-2 top-2 z-20 grid h-7 w-7 place-items-center rounded-full text-muted-foreground"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onRemove(item.animeId);
                                    }}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </Link>
                    );
                })}
            </div>
    );
};
