import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Info, Pause, Play, Star, Volume2, VolumeX } from 'lucide-react';
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
  getTrailerUrl,
  type HeroAnime,
} from '@/hooks/useHeroAnimeMultiSource';

interface HeroSectionProps {
  heroAnime: HeroAnime[];
}

const SLIDE_MS = 22000;
const FADE_MS = 1200;
/** The trailer starts buffering invisibly this long into a slide... */
const TRAILER_PRELOAD_MS = 3500;
/** ...and may only take over the stage once it is truly playing, and not before this. */
const TRAILER_MIN_REVEAL_MS = 7000;
/** Skip the first frames: YouTube's title card / play glyph / ad slate live there. */
const TRAILER_SKIP_SEC = 1.2;
/** Hand the stage back to the artwork this long before the slide changes. */
const TRAILER_OUTRO_MS = 1600;

/**
 * The spotlight lets each title's banner fill the scene, with the editorial
 * copy and actions anchored over the darker left side.
 */
export const HeroSection = ({ heroAnime }: HeroSectionProps) => {
  const location = useLocation();

  const slides = useMemo(() => {
    const valid = (heroAnime || [])
      .filter((a) => Boolean(a && (a.bannerImage?.trim() || a.coverImage?.extraLarge || a.coverImage?.large)))
      .sort((a, b) => Number(Boolean(b.bannerImage?.trim())) - Number(Boolean(a.bannerImage?.trim())));

    return valid.length ? valid.slice(0, 8) : heroAnime || [];
  }, [heroAnime]);

  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [trailerMounted, setTrailerMounted] = useState(false);
  const [trailerLive, setTrailerLive] = useState(false);
  const [minRevealPassed, setMinRevealPassed] = useState(false);
  const [outro, setOutro] = useState(false);
  const [muted, setMuted] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);

  const rafRef = useRef(0);
  const startedRef = useRef(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playback = useRef({ last: 0, steady: 0 });
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const safeIndex = count ? ((index % count) + count) % count : 0;
  const anime = slides[safeIndex];

  const goTo = useCallback(
    (next: number) => {
      if (!count) return;
      const target = ((next % count) + count) % count;
      if (target === safeIndex) return;
      setPrev(safeIndex);
      setIndex(target);
      window.setTimeout(() => setPrev(null), FADE_MS);
    },
    [count, safeIndex]
  );

  const next = useCallback(() => goTo(safeIndex + 1), [goTo, safeIndex]);

  useEffect(() => {
    slides.slice(0, 3).forEach((a) => {
      const src = coverCandidates(a)[0] || artworkCandidates(a)[0];
      if (src) {
        const img = new Image();
        img.src = src;
      }
    });
  }, [slides]);

  useEffect(() => {
    const onVisibility = () => {
      setPaused(document.hidden);
      setPageVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (paused || userPaused || count <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    startedRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startedRef.current;
      if (elapsed >= SLIDE_MS - TRAILER_OUTRO_MS) setOutro(true);
      if (elapsed >= SLIDE_MS) {
        next();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [safeIndex, paused, userPaused, count, next]);

  // Buffer the trailer offstage, then reveal it only once YouTube reports real playback
  // past the title card, so the play glyph, spinner and ad slate are never seen.
  useEffect(() => {
    setTrailerMounted(false);
    setTrailerLive(false);
    setMinRevealPassed(false);
    setOutro(false);
    playback.current = { last: 0, steady: 0 };
    if (!pageVisible || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Narrow / touch players render YouTube's own pause, skip and title chrome over the video
    // no matter what the embed flags say, so phones keep the artwork and save the data.
    if (!window.matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches) return;
    const mount = window.setTimeout(() => setTrailerMounted(true), TRAILER_PRELOAD_MS);
    const reveal = window.setTimeout(() => setMinRevealPassed(true), TRAILER_MIN_REVEAL_MS);
    return () => {
      window.clearTimeout(mount);
      window.clearTimeout(reveal);
    };
  }, [safeIndex, pageVisible]);

  useEffect(() => {
    if (!trailerMounted) return;
    const onMessage = (event: MessageEvent) => {
      if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(event.origin)) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      let data: { event?: string; info?: { currentTime?: number; playerState?: number; videoData?: { video_id?: string } } };
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      const info = data?.info;
      if (data?.event !== 'infoDelivery' || !info) return;

      // Anything that is not this title's own trailer (an ad slate, a replaced video) keeps the stage dark.
      const videoId = info.videoData?.video_id;
      if (videoId && anime?.trailer?.id && videoId !== anime.trailer.id) {
        playback.current = { last: 0, steady: 0 };
        setTrailerLive(false);
        return;
      }
      if (info.playerState === 0 || info.playerState === 3 || info.playerState === -1 || info.playerState === 5) {
        playback.current = { last: 0, steady: 0 };
        setTrailerLive(false);
        return;
      }
      if (typeof info.currentTime === 'number') {
        const { last, steady } = playback.current;
        const t = info.currentTime;
        // Time must move forward in small steps, a few times in a row, before we trust it is real footage.
        const advancing = t > last && t - last < 2.5;
        playback.current = { last: t, steady: advancing ? steady + 1 : 0 };
        if (t < last - 0.5) setTrailerLive(false);
        else if (t >= TRAILER_SKIP_SEC && playback.current.steady >= 3) setTrailerLive(true);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [trailerMounted, anime?.trailer?.id]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!trailerMounted || !win) return;
    win.postMessage(JSON.stringify({ event: 'command', func: muted ? 'mute' : 'unMute', args: [] }), '*');
  }, [muted, trailerMounted]);

  if (!anime || !count) {
    return (
      <section className="page-x pt-4">
        <div className="skeleton h-[400px] w-full rounded-2xl sm:h-[440px]" />
      </section>
    );
  }

  const title = getHeroTitle(anime);
  const titleLengthClass = title.length > 48 ? 'home-hero-title-long' : title.length > 32 ? 'home-hero-title-medium' : '';
  const studio = getStudioName(anime);
  const rating = formatHeroRating(anime.averageScore);
  const season = getSeasonLabel(anime.season, anime.seasonYear);
  const genres = normalizeAnimeGenresForDisplay(anime.genres).slice(0, 2);
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
  const focal = getHeroFocal(anime);

  const trailerUrl = trailerMounted ? getTrailerUrl(anime) : null;
  const cinematic = Boolean(trailerUrl) && trailerLive && minRevealPassed && !outro;
  const subscribe = () => {
    // Ask the embed to stream state back (the YouTube IFrame API handshake, without the script).
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(JSON.stringify({ event: 'listening', id: 'hero', channel: 'widget' }), '*');
  };

  const controlBtn =
    'grid h-7 w-7 place-items-center rounded-full text-foreground/55 transition-colors hover:bg-white/10 hover:text-foreground';

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Spotlight titles"
      className={cn('home-hero-section', cinematic && 'is-cinematic')}
      style={atmosphereStyle(anime.coverImage?.color)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const start = touchRef.current;
        touchRef.current = null;
        if (!start) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) goTo(safeIndex + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="home-hero home-hero-letterbox group relative overflow-hidden">
        <div className="home-hero-stage relative min-h-[39rem] lg:min-h-[36rem]">
          {slides.map((slide, i) =>
            i === safeIndex || i === prev ? (
              <HeroBackdrop key={`${slide.id}-${i}`} anime={slide} active={i === safeIndex} />
            ) : null
          )}

          {trailerUrl && (
            <div key={trailerUrl} className={cn('home-hero-trailer', cinematic && 'is-live')} aria-hidden>
              <iframe
                ref={iframeRef}
                src={`${trailerUrl}?autoplay=1&mute=1&controls=0&loop=1&playlist=${anime.trailer?.id}&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&disablekb=1&fs=0&cc_load_policy=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
                title=""
                tabIndex={-1}
                allow="autoplay; encrypted-media"
                onLoad={() => {
                  subscribe();
                  window.setTimeout(subscribe, 600);
                }}
                className="home-hero-trailer-frame"
              />
              <div className="home-hero-trailer-shutter" />
            </div>
          )}

          {/* Keep the text column legible while leaving the banner's right side bright. */}
          <div className="home-hero-scrim pointer-events-none absolute inset-0 z-[3]">
            <div className="home-hero-copy-light absolute inset-0" />
            <div className="home-hero-vignette absolute inset-0" />
            <div className="home-hero-grain absolute inset-0" />
          </div>

          <button
            type="button"
            onClick={() => setMuted((v) => !v)}
            aria-label={muted ? 'Unmute trailer' : 'Mute trailer'}
            tabIndex={cinematic ? 0 : -1}
            className={cn('home-hero-mute', cinematic && 'is-visible')}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>

          <div key={safeIndex} className="home-hero-content animate-fade relative z-[4] flex min-h-[39rem] flex-col justify-end lg:absolute lg:inset-0 lg:min-h-0">
            <div className="home-hero-copy mx-auto w-full max-w-[96rem] px-5 pb-8 pt-24 sm:px-9 sm:pb-10 lg:px-10 lg:pb-12">
              <div className="max-w-[42rem]">
              <p className="eyebrow flex items-center gap-2 text-[10px] text-[hsl(var(--primary))] sm:text-[11px]">
                Spotlight
                {season && <span className="text-muted-foreground">· {season}</span>}
              </p>

              <h1 className={cn('home-hero-title mt-2 break-words text-[1.8rem] font-medium leading-[0.9] text-white sm:mt-2.5 sm:text-[3rem] lg:max-w-[42rem] lg:text-[4.25rem]', titleLengthClass)}>
                {title}
              </h1>

              <div className="home-hero-meta mt-2 flex flex-wrap items-center gap-y-1 text-[11px] text-white/80 sm:mt-3 sm:text-[13px]">
                {rating && (
                  <span className="inline-flex items-center gap-1.5 font-medium text-amber-200">
                    <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                    {rating}
                  </span>
                )}
                <span className="uppercase tracking-wide">{format}</span>
                {episodes && <span className="hidden sm:inline">{episodes}</span>}
                {studio && <span className="hidden sm:inline">{studio}</span>}
                {airing && <span className="hidden text-emerald-300/90 sm:inline">{airing}</span>}
              </div>

              <div className="home-hero-summary mt-3 sm:mt-4">
                <p className="line-clamp-3 max-w-xl text-[13px] leading-relaxed text-white/80 sm:line-clamp-3 sm:text-[15px]">
                  {synopsis}
                </p>
              </div>

              <div className="home-hero-actions mt-4 flex flex-wrap items-center gap-2 sm:mt-6 sm:gap-2.5">
                <Link
                  to={watchPath(ref, 1)}
                  state={{ from: location.pathname + location.search }}
                  className="btn-ember inline-flex items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold sm:px-5"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Watch now
                </Link>
                <Link
                  to={animePath(ref)}
                  state={{ from: location.pathname + location.search }}
                  className="home-hero-details inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground/85 transition-colors hover:text-white"
                >
                  <Info className="h-3.5 w-3.5" />
                  More details
                </Link>
              </div>

              {count > 1 && (
                <div
                  className={cn('home-hero-pager', (paused || userPaused) && 'is-paused')}
                  style={{ '--slide-ms': `${SLIDE_MS}ms` } as CSSProperties}
                  aria-label="Spotlight titles"
                >
                  {slides.map((slide, slideIndex) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => goTo(slideIndex)}
                      aria-label={`Show ${getHeroTitle(slide)}`}
                      aria-pressed={slideIndex === safeIndex}
                      className={cn(slideIndex === safeIndex && 'is-active', slideIndex < safeIndex && 'is-done')}
                    >
                      <span />
                    </button>
                  ))}
                </div>
              )}

              {genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-3.5 sm:gap-2">
                  {genres.map((g) => (
                    <Link
                      key={g}
                      to={`/browse?genres=${encodeURIComponent(g)}`}
                      className="home-hero-genre py-0.5 text-[10px] text-foreground/75 transition-colors hover:text-foreground sm:text-[11px]"
                    >
                      {g}
                    </Link>
                  ))}
                </div>
              )}
              </div>
            </div>

          </div>

          {count > 1 && (
            <div className="home-hero-controls hidden lg:flex" aria-label="Spotlight controls">
              <button type="button" onClick={() => goTo(safeIndex - 1)} aria-label="Previous title" className={controlBtn}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              {slides.map((slide, slideIndex) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => goTo(slideIndex)}
                  aria-label={`Show ${getHeroTitle(slide)}`}
                  aria-pressed={slideIndex === safeIndex}
                  className={`home-hero-dot${slideIndex === safeIndex ? ' is-active' : ''}`}
                />
              ))}
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
          )}
        </div>
      </div>
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

function artworkCandidates(anime: HeroAnime): string[] {
  const banner = anime.bannerImage?.trim();
  const cover = coverCandidates(anime);
  const bannerProxy = banner ? `${apiUrl('/api/image-proxy')}?url=${encodeURIComponent(banner)}` : '';
  // Try both direct CDN images before the local proxy so a missing API process
  // can never leave the opening frame blank while the carousel advances.
  return [...new Set([banner, cover[0], bannerProxy, ...cover.slice(1)].filter(Boolean))] as string[];
}

const HERO_FOCAL_BY_ID: Record<string, { desktop: string; mobile: string }> = {
  '151807': { desktop: '68% 38%', mobile: '72% 22%' }, // Solo Leveling
  '154587': { desktop: '72% 36%', mobile: '74% 20%' }, // Frieren
  '16498': { desktop: '70% 38%', mobile: '76% 18%' }, // Attack on Titan
};

function getHeroFocal(anime: HeroAnime) {
  return HERO_FOCAL_BY_ID[String(anime.id)] ?? { desktop: '72% 38%', mobile: '76% 20%' };
}

/** Banner art leads; the cover and its proxy remain the fallback. */
function HeroBackdrop({ anime, active }: { anime: HeroAnime; active: boolean }) {
  const candidates = useMemo(() => artworkCandidates(anime), [anime]);
  const [srcIndex, setSrcIndex] = useState(0);
  useEffect(() => setSrcIndex(0), [anime.id]);
  const src = candidates[srcIndex] || '';
  const hasBanner = Boolean(anime.bannerImage?.trim());

  return (
    <div
      className={cn('absolute inset-0', active && 'animate-fade')}
      style={{
        opacity: active ? 1 : 0,
        zIndex: active ? 2 : 1,
        backgroundColor: anime.coverImage?.color || '#11131b',
        transition: `opacity ${FADE_MS}ms ease-in-out`,
      } as CSSProperties}
      aria-hidden
    >
      {src && (
        hasBanner ? (
          <>
            <img
              src={coverCandidates(anime)[0]}
              alt=""
              className="home-hero-art-underlay absolute inset-0 h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
              decoding="async"
              referrerPolicy="no-referrer"
            />
            <img
              src={src}
              alt=""
              className="home-hero-art home-hero-art-desktop h-full w-full origin-center object-cover"
              style={{
                '--hero-position-desktop': getHeroFocal(anime).desktop,
                '--hero-position-mobile': getHeroFocal(anime).mobile,
                transform: active ? 'scale(1.035)' : 'scale(1.015)',
                transition: active ? `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : undefined,
              } as CSSProperties}
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setSrcIndex((i) => (i + 1 < candidates.length ? i + 1 : i))}
            />
            <img
              src={coverCandidates(anime)[0]}
              alt=""
              className="home-hero-mobile-art home-hero-character-art absolute inset-0 h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          </>
        ) : (
          <>
            <div className="home-hero-cover-stage absolute inset-0" />
            <img
              src={src}
              alt=""
              className="home-hero-cover-art"
              loading="eager"
              fetchPriority="high"
              style={{
                transform: active ? 'translateX(1%) scale(1.06)' : 'translateX(0%) scale(1.02)',
                transition: active ? `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : undefined,
              }}
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setSrcIndex((i) => (i + 1 < candidates.length ? i + 1 : i))}
            />
            <div className="home-hero-cover-fade absolute inset-0" />
          </>
        )
      )}
    </div>
  );
}
