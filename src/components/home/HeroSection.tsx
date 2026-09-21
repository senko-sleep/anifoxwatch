import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Info, Pause, Play, Star } from 'lucide-react';
import {
  atmosphereStyle,
  cn,
  isPlaceholderAnimeDescription,
  normalizeAnimeGenresForDisplay,
} from '@/lib/utils';
import { animePath, watchPath } from '@/lib/routes';
import { apiUrl } from '@/lib/api-config';
import {
  formatHeroRating,
  getHeroTitle,
  getSeasonLabel,
  getStudioName,
  type HeroAnime,
} from '@/hooks/useHeroAnimeMultiSource';

interface HeroSectionProps {
  heroAnime: HeroAnime[];
}

const SLIDE_MS = 12000;
const FADE_MS = 600;

/**
 * The spotlight, in two quiet parts. The frame holds one title — its own
 * cover colour as the light, the sharp poster beside the text. Everything
 * about what comes next lives in its own row underneath, so nothing competes
 * with the title for attention.
 */
export const HeroSection = ({ heroAnime }: HeroSectionProps) => {
  const location = useLocation();

  const slides = useMemo(() => {
    const valid = (heroAnime || []).filter((a) => Boolean(a && (a.coverImage?.extraLarge || a.coverImage?.large)));
    return valid.length ? valid.slice(0, 8) : heroAnime || [];
  }, [heroAnime]);

  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const rafRef = useRef(0);
  const startedRef = useRef(0);
  const rowRef = useRef<HTMLUListElement>(null);

  const safeIndex = count ? ((index % count) + count) % count : 0;
  const anime = slides[safeIndex];

  const goTo = useCallback(
    (next: number) => {
      if (!count) return;
      const target = ((next % count) + count) % count;
      if (target === safeIndex) return;
      setPrev(safeIndex);
      setIndex(target);
      setProgress(0);
      window.setTimeout(() => setPrev(null), FADE_MS);
    },
    [count, safeIndex]
  );

  const next = useCallback(() => goTo(safeIndex + 1), [goTo, safeIndex]);

  useEffect(() => {
    slides.slice(0, 3).forEach((a) => {
      const src = a.coverImage?.extraLarge || a.coverImage?.large;
      if (src) {
        const img = new Image();
        img.src = src;
      }
    });
  }, [slides]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (paused || userPaused || count <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    startedRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startedRef.current;
      setProgress(Math.min(elapsed / SLIDE_MS, 1));
      if (elapsed >= SLIDE_MS) {
        next();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [safeIndex, paused, userPaused, count, next]);

  // The row always starts at "next" — scroll it back when the slide changes.
  useEffect(() => {
    rowRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, [safeIndex]);

  if (!anime || !count) {
    return (
      <section className="page-x pt-4">
        <div className="skeleton h-[400px] w-full rounded-2xl sm:h-[440px]" />
      </section>
    );
  }

  const title = getHeroTitle(anime);
  const studio = getStudioName(anime);
  const rating = formatHeroRating(anime.averageScore);
  const season = getSeasonLabel(anime.season, anime.seasonYear);
  const genres = normalizeAnimeGenresForDisplay(anime.genres).slice(0, 3);
  const format = (anime.format || 'TV').replace(/_/g, ' ');
  const episodes = anime.episodes && anime.episodes > 0 ? `${anime.episodes} episodes` : null;
  const airing = airsIn(anime);

  const ref = {
    id: String(anime.id).startsWith('anilist-') ? String(anime.id) : `anilist-${anime.id}`,
    title,
    titleEnglish: anime.title?.english,
    titleRomaji: anime.title?.romaji,
    genres: anime.genres,
  };

  const synopsis = (() => {
    const raw = anime.description?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
    if (raw && !isPlaceholderAnimeDescription(raw)) return raw;
    return genres.length
      ? `${genres.join(', ')} — one of the season's most talked-about titles.`
      : 'A spotlight pick from this season.';
  })();

  // Everything after the current slide, in the order it will appear.
  const upNext = Array.from({ length: count - 1 }, (_, i) => {
    const slideIndex = (safeIndex + 1 + i) % count;
    return { slide: slides[slideIndex], slideIndex };
  });

  const controlBtn =
    'grid h-7 w-7 place-items-center rounded-full text-foreground/55 transition-colors hover:bg-white/10 hover:text-foreground';

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Spotlight titles"
      className="page-x pt-3 sm:pt-5"
      style={atmosphereStyle(anime.coverImage?.color)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[hsl(234_28%_7%)]"
        style={{ boxShadow: 'var(--shadow-lifted)' }}
      >
        <div className="relative lg:h-[460px]">
          {slides.map((slide, i) =>
            i === safeIndex || i === prev ? (
              <HeroBackdrop key={`${slide.id}-${i}`} anime={slide} active={i === safeIndex} />
            ) : null
          )}

          {/* One scrim for the text column, one low; the blurred cover stays soft behind them. */}
          <div className="pointer-events-none absolute inset-0 z-[3]">
            <div className="absolute inset-0 bg-gradient-to-r from-[hsl(234_32%_5%_/_0.92)] via-[hsl(234_32%_5%_/_0.6)] to-[hsl(234_32%_5%_/_0.25)]" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[hsl(234_32%_5%_/_0.85)] to-transparent" />
            <div className="atmos-wash absolute inset-0 opacity-60 mix-blend-screen" />
          </div>

          <div key={safeIndex} className="animate-fade relative z-[4] flex flex-col justify-end sm:min-h-[27.5rem] sm:flex-row sm:items-end sm:justify-between sm:gap-8 lg:absolute lg:inset-0 lg:min-h-0 lg:gap-10">
            <div className="w-full max-w-2xl px-4 pb-4 pt-4 sm:p-8 lg:p-10">
              <div className="flex items-end gap-3 sm:block">
              <Link
                to={animePath(ref)}
                tabIndex={-1}
                aria-hidden
                className="art-frame relative block aspect-[2/3] w-[5.25rem] shrink-0 !rounded-lg sm:hidden"
              >
                <Thumb anime={anime} eager />
              </Link>
              <div className="min-w-0 flex-1">
              <p className="eyebrow flex items-center gap-2 text-[9.5px] text-[hsl(var(--primary))] sm:text-[11px]">
                Spotlight
                {season && <span className="text-muted-foreground">· {season}</span>}
              </p>

              <h1 className="mt-1.5 font-display text-[1.1rem] font-medium leading-[1.2] sm:mt-2.5 text-foreground sm:text-4xl lg:text-[2.5rem]">
                {title}
              </h1>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-muted-foreground sm:mt-3 sm:gap-x-3 sm:gap-y-1.5 sm:text-[13px]">
                {rating && (
                  <span className="inline-flex items-center gap-1.5 font-medium text-amber-200">
                    <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                    {rating}
                  </span>
                )}
                <span className="uppercase tracking-wide">{format}</span>
                {episodes && <span>{episodes}</span>}
                {studio && <span className="hidden sm:inline">{studio}</span>}
                {airing && <span className="text-emerald-300/90">{airing}</span>}
              </div>

              </div>
              </div>

              <p className="mt-3 line-clamp-2 max-w-xl text-[12px] leading-relaxed text-foreground/60 sm:mt-3.5 sm:line-clamp-3 sm:text-sm sm:text-foreground/65">
                {synopsis}
              </p>

              {genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-3.5 sm:gap-2">
                  {genres.map((g) => (
                    <Link
                      key={g}
                      to={`/browse?genres=${encodeURIComponent(g)}`}
                      className="glass-chip rounded-full px-2 py-0.5 text-[10px] text-foreground/70 transition-colors hover:text-foreground sm:px-2.5 sm:py-1 sm:text-[11px]"
                    >
                      {g}
                    </Link>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-5 sm:gap-2.5">
                <Link
                  to={watchPath(ref, 1)}
                  state={{ from: location.pathname + location.search }}
                  className="btn-ember inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold sm:h-11 sm:gap-2 sm:px-6 sm:text-sm"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Watch now
                </Link>
                <Link
                  to={animePath(ref)}
                  state={{ from: location.pathname + location.search }}
                  className="glass-button inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-foreground/85 sm:h-11 sm:gap-2 sm:px-5 sm:text-sm"
                >
                  <Info className="h-4 w-4" />
                  More details
                </Link>
              </div>
            </div>

            {/* The title's own poster — the sharp counterpart to the soft backdrop. */}
            <Link
              to={animePath(ref)}
              tabIndex={-1}
              aria-hidden
              className="art-frame relative mb-8 mr-8 hidden aspect-[2/3] w-36 shrink-0 sm:block lg:mb-10 lg:mr-10 lg:w-[184px] xl:w-[200px]"
            >
              <Thumb anime={anime} eager />
            </Link>
          </div>
        </div>
      </div>

      {/* Up next — its own section, outside the frame. */}
      {count > 1 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between px-0.5">
            <span className="eyebrow">Up next</span>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => goTo(safeIndex - 1)} aria-label="Previous title" className={controlBtn}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" onClick={next} aria-label="Next title" className={controlBtn}>
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setUserPaused((v) => !v)}
                aria-label={userPaused ? 'Resume carousel' : 'Pause carousel'}
                className={controlBtn}
              >
                {userPaused ? <Play className="h-3 w-3 fill-current" /> : <Pause className="h-3 w-3 fill-current" />}
              </button>
            </div>
          </div>

          <ul ref={rowRef} className="scrollbar-none -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {upNext.map(({ slide, slideIndex }, i) => (
              <li
                key={`${slide.id}-${slideIndex}`}
                className="w-[15.5rem] shrink-0 snap-start lg:w-[calc((100%-2.25rem)/4)]"
              >
                <button
                  type="button"
                  onClick={() => goTo(slideIndex)}
                  style={atmosphereStyle(slide.coverImage?.color)}
                  className="glass-button relative flex w-full items-center gap-3 overflow-hidden rounded-xl p-2 text-left"
                >
                  <div className="art-frame relative aspect-[2/3] w-11 shrink-0 !rounded-md">
                    <Thumb anime={slide} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground/90">
                      {getHeroTitle(slide)}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {[
                        formatHeroRating(slide.averageScore) && `★ ${formatHeroRating(slide.averageScore)}`,
                        (slide.format || 'TV').replace(/_/g, ' '),
                        normalizeAnimeGenresForDisplay(slide.genres)[0],
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {i === 0 && (
                    <span
                      className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-[hsl(var(--primary))]/70"
                      style={{ transform: `scaleX(${progress})` }}
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

/** "Episode 5 in 2d 4h" — the reason to come back, when the title is still airing. */
function airsIn(anime: HeroAnime): string | null {
  const n = anime.nextAiringEpisode;
  if (!n?.airingAt) return null;
  const ms = n.airingAt * 1000 - Date.now();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const when = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
  return `Episode ${n.episode} in ${when}`;
}

function coverCandidates(anime: HeroAnime): string[] {
  const cover = anime.coverImage?.extraLarge?.trim() || anime.coverImage?.large?.trim();
  if (!cover) return [];
  return [cover, `${apiUrl('/api/image-proxy')}?url=${encodeURIComponent(cover)}`];
}

/** Poster with a proxy retry — hotlink-blocked covers still render. */
function Thumb({ anime, eager }: { anime: HeroAnime; eager?: boolean }) {
  const candidates = useMemo(() => coverCandidates(anime), [anime]);
  const [srcIndex, setSrcIndex] = useState(0);
  useEffect(() => setSrcIndex(0), [anime.id]);

  const src = candidates[srcIndex];
  if (!src) return <div className="absolute inset-0 bg-[hsl(234_22%_11%)]" />;

  return (
    <img
      src={src}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      className="absolute inset-0 h-full w-full object-cover"
      onError={() => setSrcIndex((i) => (i + 1 < candidates.length ? i + 1 : i))}
    />
  );
}

/**
 * Backdrop: the title's own cover, enlarged and softened into a wash of its
 * colours. Wide AniList banners are ~400px tall screenshots — stretched to
 * this frame they read as blur that doesn't belong, so we don't use them.
 */
function HeroBackdrop({ anime, active }: { anime: HeroAnime; active: boolean }) {
  const candidates = useMemo(() => coverCandidates(anime), [anime]);
  const [srcIndex, setSrcIndex] = useState(0);
  useEffect(() => setSrcIndex(0), [anime.id]);
  const src = candidates[srcIndex] || '';

  return (
    <div
      className={cn('absolute inset-0 overflow-hidden', active && 'animate-fade')}
      style={{
        opacity: active ? 1 : 0,
        zIndex: active ? 2 : 1,
        transition: `opacity ${FADE_MS}ms ease-in-out`,
      } as CSSProperties}
      aria-hidden
    >
      {src && (
        <img
          src={src}
          alt=""
          className="h-full w-full scale-125 object-cover opacity-80 blur-3xl saturate-150"
          style={{ objectPosition: 'center 30%' }}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setSrcIndex((i) => (i + 1 < candidates.length ? i + 1 : i))}
        />
      )}
    </div>
  );
}
