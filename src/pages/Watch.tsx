import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { WatchEpisodeGrid } from '../components/player/WatchEpisodeGrid';
import { StreamingControls } from '../components/player/StreamingControls';
import { DownloadManager } from '../components/player/DownloadManager';
import { useHentaiTitle } from '@/hooks/useHentai';
import { useAnime, useAnimeArtwork, useEpisodes, useEpisodeDetails, useSeasons, useStreamingLinks, useEpisodeServers, useDubStreamProbe, usePrefetchNextEpisode, usePrefetchDubStream } from '@/hooks/useAnime';
import { ping } from '@/utils/keep-alive';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { atmosphereStyle, cn, formatRating } from '@/lib/utils';
import { animeSlug, hentaiSlugToId, parseSeasonParam, watchPathForSlug } from '@/lib/routes';
import { apiUrl } from '@/lib/api-config';
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Play,
  RefreshCw,
  RotateCw,
  Star,
} from 'lucide-react';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { WatchHistory } from '@/lib/watch-history';
import { toast } from 'sonner';

type AudioType = 'sub' | 'dub';

const EMBED_DOMAINS = ['streamwish', 'mega.nz', 'hqq.tv', 'streamtape', 'doodstream', 'mp4upload', 'sendvid', 'ok.ru', 'flixcloud', 'megacloud', 'rabbitstream', 'dokicloud'];
// Aniwaves / EchoVideo embeds are domain-locked — loading them in our iframe yields
// "Embedding blocked on this site". Treat them as non-embeddable so the player never
// tries to render them (and instead fails over to a real stream source).
const DOMAIN_LOCKED_EMBED = /aniwaves\.ru|echovideo|burntburst|play\.echovideo/i;
const isEmbedUrl = (url: string) => {
  const lower = url.toLowerCase();
  if (!lower) return false;
  if (DOMAIN_LOCKED_EMBED.test(lower)) return false;
  if (lower.includes('.m3u8') || lower.includes('.mp4')) return false;
  // Streamtape /get_video? and tapecontent CDN are direct video links, not embed pages
  if ((lower.includes('streamtape') || lower.includes('tapecontent')) && lower.includes('get_video')) return false;
  return EMBED_DOMAINS.some((d) => lower.includes(d));
};
type QualityType = '1080p' | '720p' | '480p' | '360p' | 'auto';

function plainDescription(raw: string | undefined): string {
  if (!raw) return '';
  const t = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > 280 ? `${t.slice(0, 280)}…` : t;
}

const Watch = ({ adult = false }: { adult?: boolean }) => {
  const { animeId } = useParams<{ animeId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const sourceParam = searchParams.get('source') || undefined;

  const [resolvedId, setResolvedId] = useState<string>('');
  const [isResolving, setIsResolving] = useState(false);
  
  // URLs look like /watch/attack-on-titan-16498/episode-1. The old ?id= form is still
  // understood here, though LegacyWatchRedirect normally rewrites it first.
  let rawAnimeId = searchParams.get('id') || animeId || '';
  
  // Check if this is a slug-based URL (looks like a slug, not a numeric ID)
  const isSlugBased = animeId && !searchParams.get('id') && !/^\d+$/.test(animeId) && !animeId.startsWith('anilist-');
  
  // Resolve slug to actual anime ID if needed
  useEffect(() => {
    const resolveSlug = async () => {
      if (adult) return; // /watch/hentai/<slug> maps to its id directly — see cleanAnimeId
      if (isSlugBased && animeId) {
        setIsResolving(true);
        try {
          // Adult mode comes from ?mode=adult (or an adult source param)
          const mode = (searchParams.get('mode') === 'adult' ||
            (sourceParam && ['watchhentai', 'hanime', 'akih'].includes(sourceParam.toLowerCase())))
            ? 'adult'
            : 'safe';
          const response = await fetch(apiUrl(`/api/anime/resolve-slug?slug=${encodeURIComponent(animeId)}&mode=${mode}`));
          if (response.ok) {
            const data = await response.json();
            setResolvedId(data.id || animeId);
          } else {
            // Fallback to using the slug as ID
            setResolvedId(animeId);
          }
        } catch (error) {
          console.error('Failed to resolve slug:', error);
          setResolvedId(animeId);
        } finally {
          setIsResolving(false);
        }
      } else {
        setResolvedId(rawAnimeId);
      }
    };
    
    resolveSlug();
  }, [animeId, rawAnimeId, isSlugBased, sourceParam]);
  
  // Use the resolved ID for API calls
  const cleanAnimeId = adult && animeId ? hentaiSlugToId(animeId) : isSlugBased ? resolvedId : rawAnimeId;

  // "Back" from the player goes to the title page for this anime.
  const animeHref = `/${adult ? 'hentai' : 'anime'}/${encodeURIComponent(animeId || rawAnimeId)}`;

  // Wide artwork: the player's poster when the episode has no still of its own (movies, new shows).
  const { data: artwork } = useAnimeArtwork(cleanAnimeId, cleanAnimeId.length > 0 && !adult);

  // Stills and titles for the shelf below the player.
  const { data: episodeDetails } = useEpisodeDetails(cleanAnimeId, cleanAnimeId.length > 0 && !adult);

  // Every season of this franchise, in watch order — the same chain the title page uses.
  const { data: seasons = [] } = useSeasons(cleanAnimeId, cleanAnimeId.length > 0 && !adult);
  const seasonIndex = seasons.findIndex((entry) => `anilist-${entry.id}` === cleanAnimeId);
  const currentSeason = seasonIndex >= 0 ? seasonIndex + 1 : null;

  // Immediately ping the API on watch page mount to ensure the Vercel function is warm
  // before stream fetch begins — eliminates the cold-start delay users see on first load.
  useEffect(() => { ping(); }, []);


  // State
  const [selectedAnimeId, setSelectedAnimeId] = useState<string>(cleanAnimeId);
  const [selectedEpisode, setSelectedEpisode] = useState<string | null>(null);
  // The episode lives in `?ep=` — /watch/anime/<slug>?ep=3
  const epParam = parseInt(searchParams.get('ep') || '', 10);
  const urlEpNum = Number.isFinite(epParam) && epParam > 0 ? epParam : null;
  const initialEpisodeNum = urlEpNum ?? 1;
  // `?s=` names the season's place in the franchise. The slug still decides what
  // plays; `s` keeps the URL self-describing and lets the viewer move between
  // seasons by editing it.
  const urlSeason = parseSeasonParam(searchParams.get('s'));

  useEffect(() => {
    if (!seasons.length) return;

    // `?s=` asks for a season we aren't on — switch to that entry, keeping the episode.
    if (urlSeason && urlSeason !== currentSeason && urlSeason <= seasons.length) {
      const target = seasons[urlSeason - 1];
      const slug = animeSlug({ id: `anilist-${target.id}`, title: target.title });
      const rest = new URLSearchParams(searchParams);
      rest.delete('ep');
      rest.delete('s');
      rest.delete('id');
      navigate(watchPathForSlug(slug, urlEpNum, rest.toString(), urlSeason, adult), { replace: true });
      return;
    }

    // We know which season this is but the URL doesn't say so — write it in.
    if (!urlSeason && currentSeason) {
      const rest = new URLSearchParams(searchParams);
      rest.delete('ep');
      rest.delete('id');
      navigate(
        watchPathForSlug(animeId || rawAnimeId, urlEpNum, rest.toString(), currentSeason, adult),
        { replace: true, state: location.state }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasons, urlSeason, currentSeason, urlEpNum]);
  const [selectedEpisodeNum, setSelectedEpisodeNum] = useState<number>(initialEpisodeNum);
  const [audioType, setAudioType] = useState<AudioType>(() => {
    // Restore stored preference; default to dub — auto-falls back to sub if dub has no sources
    try {
      const raw = animeId || '';
      const trailing = raw.match(/-(\d{1,9})$/);
      const prefKey = raw.startsWith('anilist-') || !trailing ? raw : `anilist-${trailing[1]}`;
      const prefs = JSON.parse(localStorage.getItem('anime_audio_prefs') || '{}');
      if (prefs[prefKey] === 'dub') return 'dub';
      if (prefs[prefKey] === 'sub') return 'sub';
    } catch { /* ignore */ }
    return 'sub';
  });
  const [audioManuallySet, setAudioManuallySet] = useState(false);
  const [quality, setQuality] = useState<QualityType>('auto');
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [autoPlay, setAutoPlay] = useState(true);
  const [serverRetryCount, setServerRetryCount] = useState(0);
  const [sourceRetryIndex, setSourceRetryIndex] = useState(0);
  const [isSwitchingEpisode, setIsSwitchingEpisode] = useState(false);
  const [streamSlowWarning, setStreamSlowWarning] = useState(false);

  // Track the previously-seen animeId so the reset effect only fires on actual *navigation*
  // (cleanAnimeId changing), not on the initial mount where selectedAnimeId is already correct.
  const prevCleanAnimeIdRef = useRef<string>(rawAnimeId);

  // Refs
  const playerRef = useRef<HTMLDivElement>(null);
  const lastPlayerErrorTimeRef = useRef<number>(0);
  const playerErrorDebounceMs = 2000; // Minimum time between retry attempts

  // Mobile landscape mode
  const [isLandscapeLocked, setIsLandscapeLocked] = useState(false);

  // (Mobile overlay state removed — mobile now uses inline page layout)

  // Helper to detect mobile
  const isMobile = useCallback(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  }, []);

  // Landscape mode handler
  const handleLandscapeMode = useCallback(async () => {
    if (!isMobile()) return;
    try {
      if (isLandscapeLocked) {
        if ((screen.orientation as any).unlock) {
          (screen.orientation as any).unlock();
        }
        setIsLandscapeLocked(false);
      } else {
        if (screen.orientation && (screen.orientation as any).lock) {
          await (screen.orientation as any).lock('landscape');
        }
        setIsLandscapeLocked(true);
        playerRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (e) {
      console.warn('[Watch] Landscape lock failed:', e);
      playerRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isMobile, isLandscapeLocked]);

  // Data fetching
  // Adult titles read the adult catalog only. The generic endpoints enrich by fuzzy-matching
  // an AniList entry, which can swap in another show's poster and details.
  const hentaiTitle = useHentaiTitle(animeId, adult);
  const animeQuery = useAnime(cleanAnimeId || '', !!cleanAnimeId && !adult, sourceParam);
  const episodesQuery = useEpisodes(cleanAnimeId || '', !!cleanAnimeId && !adult, sourceParam);

  const anime = adult ? hentaiTitle.data?.anime : animeQuery.data;
  const animeLoading = adult ? hentaiTitle.isLoading : animeQuery.isLoading;
  const animeError = adult ? hentaiTitle.error : animeQuery.error;
  const episodes = adult ? hentaiTitle.data?.episodes : episodesQuery.data;
  const episodesLoading = adult ? hentaiTitle.isLoading : episodesQuery.isLoading;
  const episodesFetching = adult ? hentaiTitle.isFetching : episodesQuery.isFetching;
  const episodesError = adult ? hentaiTitle.error : episodesQuery.error;
  const refetchEpisodes = () => (adult ? hentaiTitle.refetch() : episodesQuery.refetch());

  // Group episodes by season/batches for mobile selector
  const mobileSeasons = useMemo(() => {
    if (!episodes || episodes.length <= 16) return [];
    const episodesPerSeason =
      episodes.length <= 36 ? 12 :
      episodes.length <= 150 ? 25 : 50;
    const seasonCount = Math.ceil(episodes.length / episodesPerSeason);
    return Array.from({ length: seasonCount }, (_, i) => ({
      id: `season-${i + 1}`,
      name: `Season ${i + 1}`,
      shortName: episodes.length > 75
        ? `Ep ${i * episodesPerSeason + 1}-${Math.min((i + 1) * episodesPerSeason, episodes.length)}`
        : `Season ${i + 1}`,
      startEp: i * episodesPerSeason + 1,
      endEp: Math.min((i + 1) * episodesPerSeason, episodes.length)
    }));
  }, [episodes]);

  const [mobileSeason, setMobileSeason] = useState<string>('all');

  const selectedEpisodeForCurrentAnime = selectedAnimeId === cleanAnimeId ? selectedEpisode : null;
  const { data: servers, isLoading: serversLoading } = useEpisodeServers(selectedEpisodeForCurrentAnime || '', !!selectedEpisodeForCurrentAnime);
  const serversHaveDub = useMemo(
    () => servers?.some((s) => s.type === 'dub') ?? false,
    [servers]
  );
  
  // For AniList IDs, construct episode ID directly when episodes are not available yet
  // This allows streaming to start immediately without waiting for episode list to load
  const getEpisodeIdForStreaming = useCallback(() => {
    // If we have a selected episode for the current anime, use it
    if (selectedEpisodeForCurrentAnime) {
      return selectedEpisodeForCurrentAnime;
    }
    // For AniList IDs, construct the episode ID from the AniList ID and episode number
    if (cleanAnimeId.startsWith('anilist-') && selectedEpisodeNum > 0) {
      const constructedId = `${cleanAnimeId}?ep=${selectedEpisodeNum}`;
      console.log(`[Watch] Using constructed episode ID: ${constructedId}`);
      return constructedId;
    }
    // Fallback to empty string to disable streaming
    return '';
  }, [cleanAnimeId, selectedEpisodeForCurrentAnime, selectedEpisodeNum]);
  
  // Enable streaming if we have an episode ID (either from episodes or constructed)
  const isStreamEnabled = useMemo(() => {
    const episodeId = getEpisodeIdForStreaming();
    const enabled = episodeId.length > 0;
    if (enabled && cleanAnimeId.startsWith('anilist-')) {
      console.log(`[Watch] Streaming enabled with episode ID: ${episodeId}`);
    }
    return enabled;
  }, [getEpisodeIdForStreaming, cleanAnimeId]);
  
  // Fire stream fetch immediately — don't wait for server list to load.
  // The backend defaults to 'auto' when no server is specified.
  // Only pass a server param when the user has explicitly chosen one.
  const [userPickedServer, setUserPickedServer] = useState(false);
  // Treat 'default' as no server preference — avoids a double-fetch when auto-select picks it
  const streamServer = userPickedServer && selectedServer && selectedServer.toLowerCase() !== 'default'
    ? selectedServer
    : undefined;
  const [bypassCache, setBypassCache] = useState(false);
  const {
    data: streamData,
    isLoading: streamLoading,
    error: streamError,
    refetch: refetchStream
  } = useStreamingLinks(getEpisodeIdForStreaming(), streamServer, audioType, isStreamEnabled, selectedEpisodeNum,
    cleanAnimeId.startsWith('anilist-') ? parseInt(cleanAnimeId.replace('anilist-', ''), 10) || undefined : undefined, anime?.title, bypassCache);

  // Get best quality source - skip sources that previously failed
  // IMPORTANT: implemented as useMemo (not useCallback + call-in-render) so that Watch re-renders
  // caused by unrelated state (hover, layout, etc.) don't produce new object references that would
  // make VideoPlayer think the src changed and destroy+reinit HLS mid-stream.
  const lastVideoSourceAudioRef = useRef<string | null>(null);
  const lastVideoSourceUrlRef = useRef<string | null>(null);
  const lastVideoSourceObjRef = useRef<typeof streamData extends { sources?: Array<infer S> } ? S | null : never>(null as any);

  const videoSource = useMemo(() => {
    if (!streamData?.sources?.length) {
      lastVideoSourceAudioRef.current = null;
      lastVideoSourceUrlRef.current = null;
      lastVideoSourceObjRef.current = null;
      return null;
    }

    // Filter out sources that previously had errors (simple retry tracking)
    // Also skip IP-locked sources (Streamtape /get_video) — cannot be proxied through serverless
    const sources = streamData.sources
      .filter((_, idx) => idx >= sourceRetryIndex)
      .filter((s) => !s.ipLocked);

    if (!sources.length) {
      lastVideoSourceAudioRef.current = null;
      lastVideoSourceUrlRef.current = null;
      lastVideoSourceObjRef.current = null;
      return null;
    }

    // Helper: is this source actually playable (not an embed page)?
    const isPlayable = (s: typeof sources[0]) => {
      const raw = (s as { originalUrl?: string }).originalUrl || s.url || '';
      const lower = raw.toLowerCase();
      if ((lower.includes('streamtape') || lower.includes('tapecontent')) && lower.includes('get_video')) return false;
      return lower.includes('.m3u8') || lower.includes('.mp4') || lower.includes('.mpd') ||
             !EMBED_DOMAINS.some((d) => lower.includes(d));
    };

    // First: try playable sources that match the requested audio category (dub/sub)
    const categoryMatched = sources.filter(
      (s) => s.category === audioType && isPlayable(s)
    );

    // Second fallback: any playable source (ignore category tag)
    const anyPlayable = sources.filter(isPlayable);

    // Third fallback: whatever is available
    const candidate = categoryMatched[0] ?? anyPlayable[0] ?? sources[0];

    if (!candidate) {
      lastVideoSourceAudioRef.current = null;
      lastVideoSourceUrlRef.current = null;
      lastVideoSourceObjRef.current = null;
      return null;
    }

    // ── Stable reference guard ────────────────────────────────────────────────
    // If the resolved URL string AND audioType haven't changed, return the SAME object reference
    // so VideoPlayer's [src, isM3U8] effect does NOT re-run and HLS is NOT restarted.
    const candidateUrl = candidate.url || '';
    if (
      candidateUrl &&
      candidateUrl === lastVideoSourceUrlRef.current &&
      audioType === lastVideoSourceAudioRef.current &&
      lastVideoSourceObjRef.current
    ) {
      return lastVideoSourceObjRef.current;
    }

    console.log('[Watch] Selected video source:', {
      url: candidate.url?.substring(0, 100),
      isM3U8: candidate.isM3U8,
      isDirect: candidate.isDirect,
      quality: candidate.quality,
      category: candidate.category,
      audioType,
    });

    lastVideoSourceAudioRef.current = audioType;
    lastVideoSourceUrlRef.current = candidateUrl;
    lastVideoSourceObjRef.current = candidate;
    return candidate;
  }, [streamData, sourceRetryIndex, audioType]);

  // Debug: log the video source details
  useEffect(() => {
    if (videoSource) {
      console.log('[Watch] Video source details:', {
        url: videoSource.url?.substring(0, 150),
        isM3U8: videoSource.isM3U8,
        isDirect: videoSource.isDirect,
        quality: videoSource.quality,
        source: streamData?.source
      });
    }
  }, [videoSource, streamData?.source]);

  /** Dub is available if: server list has dub, metadata says dub, active dub playback returned sources, or dub probe (while on SUB) succeeded. */
  const metadataIndicatesDub = useMemo(
    () => (anime?.dubCount ?? 0) > 0 || (episodes?.some((e) => e.hasDub) ?? false),
    [anime, episodes]
  );
  const dubPlaybackWorks =
    audioType === 'dub' && (streamData?.sources?.length ?? 0) > 0 && !streamData?.dubFallback;
  // Check if current stream data already contains dub sources (some sources return both sub and dub in one call)
  const streamHasDubSources = useMemo(
    () => (streamData?.source?.toLowerCase().includes('dub')) || false,
    [streamData]
  );
  // Disable dub probe to avoid duplicate requests - rely on server list and metadata
  const skipDubProbe = true;

  const { data: dubProbeData } = useDubStreamProbe(
    selectedEpisodeForCurrentAnime || '',
    servers,
    skipDubProbe
  );
  const dubProbeHasSources = (dubProbeData?.sources?.length ?? 0) > 0;
  const dubAvailable = useMemo(
    () => {
      // Dub is available if: servers report dub, metadata indicates dub, or active dub playback works
      return serversHaveDub || metadataIndicatesDub || dubPlaybackWorks || dubProbeHasSources;
    },
    [serversHaveDub, metadataIndicatesDub, dubPlaybackWorks, dubProbeHasSources]
  );

  // Dynamic page title
  useDocumentTitle(anime?.title ?? 'Watch', Boolean(anime?.title) ? false : true);

  useEffect(() => {
    // Only reset when the user navigates to a *different* anime — skip on initial mount
    // where prevCleanAnimeIdRef.current already equals cleanAnimeId (both set to the same value).
    if (prevCleanAnimeIdRef.current === cleanAnimeId && !isResolving) return;
    prevCleanAnimeIdRef.current = cleanAnimeId;
    setSelectedAnimeId('');
    setSelectedEpisode(null);
    setSelectedEpisodeNum(1);
    setSelectedServer('');
    setUserPickedServer(false);
    setServerRetryCount(0);
    setSourceRetryIndex(0);
    setAudioManuallySet(false);
    setStreamSlowWarning(false);
  }, [cleanAnimeId]);

  // Initialize episode from URL or first episode (runs once on mount)
  useEffect(() => {
    if (!episodes?.length) return;

    let targetEpisode = null;

    if (urlEpNum) {
      targetEpisode = episodes.find(e => e.number === urlEpNum);
    }
    
    // If no URL param or episode not found, use first episode
    if (!targetEpisode) {
      targetEpisode = episodes[0];
    }

    // Skip update if we already have this episode correctly selected.
    // This is critical for AniList IDs: streaming starts immediately via the
    // constructed ID path (`anilist-XXXX?ep=N`). When the episode list arrives
    // later, don't reset selectedEpisode — that would abort the in-flight stream
    // fetch and restart it, adding 2-5s of extra latency.
    if (
      selectedAnimeId === cleanAnimeId &&
      selectedEpisodeNum === targetEpisode.number &&
      (selectedEpisode === targetEpisode.id ||
        // AniList constructed ID is already covering this episode number
        selectedEpisode === `${cleanAnimeId}?ep=${targetEpisode.number}`)
    ) {
      // Episode already selected correctly — just ensure animeId is synced
      if (selectedAnimeId !== cleanAnimeId) setSelectedAnimeId(cleanAnimeId);
      return;
    }

    setSelectedAnimeId(cleanAnimeId);
    setSelectedEpisode(targetEpisode.id);
    setSelectedEpisodeNum(targetEpisode.number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes, cleanAnimeId]);

  // Auto-select default server ONLY when: stream has genuinely failed (non-abort),
  // we have no sources yet, and user hasn't already picked a server.
  // Previously this fired on streamLoading→false which aborted the in-flight fallback fetch.
  useEffect(() => {
    if (!servers?.length || serversLoading) return;
    if (userPickedServer || selectedServer || (streamData?.sources?.length ?? 0) > 0) return;
    // Never fire while stream is still loading (would abort in-flight request)
    if (streamLoading) return;
    // Never fire on AbortError — the fallback host is still in-flight; don't interrupt it
    if (!streamError || streamError.name === 'AbortError' ||
        streamError.message?.toLowerCase().includes('abort')) return;
    // Only fire on a real error (network failure, 5xx, etc.) — let the server's auto-routing
    // handle server selection first; only intervene when that fully fails.

    const audioTypeServers = servers.filter(s =>
      audioType === 'dub' ? s.type === 'dub' : s.type === 'sub'
    );
    const targetServers = audioTypeServers.length > 0 ? audioTypeServers : servers;

    const defaultServer = targetServers.find(s => s.name.toLowerCase().includes('neko_senko'))
      || targetServers[0];

    if (defaultServer) {
      console.log('[Watch] Auto-selecting server after stream error:', defaultServer.name);
      setSelectedServer(defaultServer.name);
    }
  }, [servers, serversLoading, userPickedServer, audioType, streamLoading, streamError, streamData]);




  // Auto-failover on stream error (simplified - less aggressive)
  useEffect(() => {
    if (!streamError || !servers?.length) return;
    // Skip abort errors - they're normal during server changes
    if (streamError.name === 'AbortError' || streamError.message?.toLowerCase().includes('abort')) {
      console.log('[Watch] ⏭️ Skipping failover - stream fetch aborted (normal during server change)');
      return;
    }
    // Don't failover on 404 - might be episode-specific
    if ((streamError as any).status === 404) {
      console.log('[Watch] ⏭️ Skipping failover - 404 error (episode not available)');
      return;
    }
    const realServers = servers;
    if (realServers.length === 0 || serverRetryCount >= realServers.length) return;
    const currentIndex = realServers.findIndex(s => s.name === selectedServer);
    const nextServer = realServers[(currentIndex + 1) % realServers.length];
    console.log(`[Watch] 🔄 Failover to server: ${nextServer.name} (attempt ${serverRetryCount + 1}/${realServers.length})`);
    toast.info(`Switching to server ${nextServer.name}...`, {
      description: `Attempt ${serverRetryCount + 1} of ${realServers.length}`,
      duration: 2000,
    });
    setSelectedServer(nextServer.name);
    setUserPickedServer(true);
    setServerRetryCount(prev => prev + 1);
  }, [streamError, servers, selectedServer, serverRetryCount]);

  // Log stream data when received
  useEffect(() => {
    if (streamData) {
      console.log('[Watch] 📺 Stream data received:', {
        sourceCount: streamData.sources?.length || 0,
        qualities: streamData.sources?.map(s => s.quality).join(', '),
        hasSubtitles: (streamData.subtitles?.length || 0) > 0,
        subtitleCount: streamData.subtitles?.length || 0,
        hasIntro: !!streamData.intro,
        source: streamData.source
      });

      if (streamData.sources?.length > 0) {
        console.log('[Watch] 🎬 Primary stream URL:', streamData.sources[0].url.substring(0, 100) + '...');
      }
    }
  }, [streamData]);

  // Log errors
  useEffect(() => {
    if (streamError) {
      if (streamError.name === 'AbortError' || streamError.message?.toLowerCase().includes('abort')) return;
      console.error('[Watch] ❌ Stream error:', streamError);
    }
  }, [streamError]);

  // Handle video player errors (less aggressive - allow recovery)
  const handlePlayerError = useCallback((error: string) => {
    // Debounce: prevent rapid-fire retries
    const now = Date.now();
    if (now - lastPlayerErrorTimeRef.current < playerErrorDebounceMs) {
      console.log('[Watch] ⏳ Debouncing player error (too soon since last retry)');
      return;
    }
    lastPlayerErrorTimeRef.current = now;

    console.error('[Watch] 🎬 Player error:', error, {
      server: selectedServer,
      episode: selectedEpisode,
      retryCount: serverRetryCount
    });

    const sources = streamData?.sources || [];
    const maxServerRetries = servers?.length || 1;

    // Check if we've exhausted ALL retry options (all sources on all servers)
    if (serverRetryCount >= maxServerRetries) {
      if (audioType === 'dub') {
        console.log('[Watch] ❌ All dub servers exhausted, falling back to sub');
        toast.info('Dub unavailable — switching to Sub');
        setAudioType('sub');
      }
      return;
    }

    // Allow failover for fragment parsing errors after HLS recovery attempts
    if (error === 'frag_parsing_error') {
      console.log('[Watch] 🔄 Fragment parsing errors exhausted - switching server');
      // Continue to server switching logic below
    }

    // Allow failover on startup timeout - stream is not loading
    if (error === 'startup_timeout_error') {
      console.log('[Watch] 🔄 Startup timeout - switching server');
      // Continue to server switching logic below
    }

    // Try next source URL (same server) first
    if (sourceRetryIndex + 1 < sources.length) {
      console.log(`[Watch] 🔄 Trying next source (index ${sourceRetryIndex + 1}/${sources.length - 1})`);
      setSourceRetryIndex(prev => prev + 1);
      return;
    }

    // If we've exhausted sources, fail over to next server
    const realServers = servers || [];
    if (realServers.length && serverRetryCount < realServers.length) {
      const currentIndex = realServers.findIndex(s => s.name === selectedServer);
      const nextServer = realServers[(currentIndex + 1) % realServers.length];
      console.log(`[Watch] 🔄 Player failover to server: ${nextServer.name} (attempt ${serverRetryCount + 1}/${realServers.length})`);
      setSelectedServer(nextServer.name);
      setUserPickedServer(true);
      setServerRetryCount(prev => prev + 1);
    }
  }, [selectedServer, selectedEpisode, serverRetryCount, servers, sourceRetryIndex, streamData, audioType, refetchStream]);

  // Reset retry count when episode or audio changes (new stream fetch)
  useEffect(() => {
    setServerRetryCount(0);
    setBypassCache(false);
  }, [selectedEpisode, audioType]);

  // Reset server selection when audioType changes to allow auto-selecting the best server for the new audio type
  useEffect(() => {
    setSelectedServer('');
    setUserPickedServer(false);
  }, [audioType]);

  // Reset source retries when stream changes
  useEffect(() => {
    setSourceRetryIndex(0);
  }, [streamData, selectedServer, audioType, quality]);

  // Show slow-load warning after 8s — different message for anilist- IDs
  // since they require cross-source resolution (AniList API + search + episodes).
  useEffect(() => {
    if (!streamLoading) { setStreamSlowWarning(false); return; }
    const t = setTimeout(() => setStreamSlowWarning(true), 8000);
    return () => clearTimeout(t);
  }, [streamLoading, selectedEpisode]);

  // Auto-fallback: if dub stream returned no sources OR server fell back to sub
  // BUT: don't auto-fallback if user manually clicked DUB - respect their choice
  useEffect(() => {
    if (audioType !== 'dub' || streamLoading) return;
    if (!streamData) return;
    if (audioManuallySet) return; // User explicitly chose DUB, don't force them back to SUB
    
    const noSources = streamData.sources?.length === 0;
    const serverServedSub = streamData.dubFallback === true;
    
    if (noSources || serverServedSub) {
      console.log('[Watch] Dub not available for this episode, falling back to sub');
      toast.info('Dub not available for this episode — switching to Sub');
      setAudioType('sub');
    }
  }, [audioType, streamLoading, streamData, audioManuallySet]);

  // Episode navigation with smooth transitions
  const handleEpisodeSelect = useCallback((episodeId: string, episodeNum: number) => {
    // Prevent unnecessary re-renders if same episode
    // For AniList IDs with constructed episode IDs, compare the episode number
    if (cleanAnimeId.startsWith('anilist-')) {
      const currentEpNum = selectedEpisodeNum;
      const currentEpId = getEpisodeIdForStreaming();
      // If we're already on this episode, don't re-trigger
      if (episodeNum === currentEpNum && episodeId === currentEpId) return;
    } else if (episodeId === selectedEpisode) {
      return;
    }

    // Set switching state to prevent URL conflicts
    setIsSwitchingEpisode(true);

    // Update URL first, then state
    if (urlEpNum !== episodeNum) {
      const rest = new URLSearchParams(searchParams);
      rest.delete('ep');
      rest.delete('id');
      rest.delete('s');
      navigate(
        watchPathForSlug(animeId || rawAnimeId, episodeNum, rest.toString(), urlSeason ?? currentSeason, adult),
        { replace: true, state: location.state }
      );
    }

    setSelectedAnimeId(cleanAnimeId);
    setSelectedEpisode(episodeId);
    setSelectedEpisodeNum(episodeNum);
    setSelectedServer(''); // Reset server for new episode
    setUserPickedServer(false); // Use auto server until user explicitly picks
    playerRef.current?.scrollIntoView({ behavior: 'smooth' });

    // Clear switching state after a delay
    setTimeout(() => {
      setIsSwitchingEpisode(false);
    }, 500);
  }, [selectedEpisode, selectedEpisodeNum, cleanAnimeId, searchParams, urlEpNum, animeId, rawAnimeId, navigate, location.state, getEpisodeIdForStreaming]);

  const handlePrevEpisode = useCallback(() => {
    // For AniList IDs, we can navigate by episode number even without episodes list
    if (cleanAnimeId.startsWith('anilist-') && selectedEpisodeNum > 1) {
      // Construct a new episode ID for the previous episode
      const prevEpisodeId = `${cleanAnimeId}?ep=${selectedEpisodeNum - 1}`;
      handleEpisodeSelect(prevEpisodeId, selectedEpisodeNum - 1);
      return;
    }
    if (!episodes?.length) return;
    const currentIndex = episodes.findIndex(e => e.id === selectedEpisode);
    if (currentIndex > 0) {
      const prev = episodes[currentIndex - 1];
      handleEpisodeSelect(prev.id, prev.number);
    }
  }, [episodes, selectedEpisode, selectedEpisodeNum, cleanAnimeId, handleEpisodeSelect]);

  const handleNextEpisode = useCallback(() => {
    // For AniList IDs, we can navigate by episode number even without episodes list
    // We'll just increment the episode number (the backend will handle if it doesn't exist)
    if (cleanAnimeId.startsWith('anilist-')) {
      const nextEpisodeId = `${cleanAnimeId}?ep=${selectedEpisodeNum + 1}`;
      handleEpisodeSelect(nextEpisodeId, selectedEpisodeNum + 1);
      return;
    }
    if (!episodes?.length) return;
    const currentIndex = episodes.findIndex(e => e.id === selectedEpisode);
    if (currentIndex < episodes.length - 1) {
      const next = episodes[currentIndex + 1];
      handleEpisodeSelect(next.id, next.number);
    }
  }, [episodes, selectedEpisode, selectedEpisodeNum, cleanAnimeId, handleEpisodeSelect]);

  // Current episode info
  const currentEpisode = episodes?.find(e => e.id === selectedEpisode);
  // For AniList IDs, always allow navigation (backend will handle if episode doesn't exist)
  // For other IDs, check if there are previous/next episodes in the list
  const hasPrev = cleanAnimeId.startsWith('anilist-') ? selectedEpisodeNum > 1 : (episodes?.findIndex(e => e.id === selectedEpisode) ?? -1) > 0;
  const hasNext = cleanAnimeId.startsWith('anilist-') ? true : episodes ? (episodes.findIndex(e => e.id === selectedEpisode) ?? 0) < episodes.length - 1 : false;

  // Prefetch next episode's stream so switching episodes feels instant
  const prefetchNext = usePrefetchNextEpisode();
  const anilistIdForPrefetch = cleanAnimeId.startsWith('anilist-')
    ? parseInt(cleanAnimeId.replace('anilist-', ''), 10) || undefined
    : undefined;

  usePrefetchDubStream(selectedEpisodeForCurrentAnime || '', !!selectedEpisodeForCurrentAnime, {
    episodeNum: selectedEpisodeNum,
    anilistId: anilistIdForPrefetch,
    animeTitle: anime?.title,
    hasDub: Boolean(currentEpisode?.hasDub || metadataIndicatesDub),
    subStreamReady: audioType === 'sub' && !streamLoading && (streamData?.sources?.length ?? 0) > 0,
  });

  useEffect(() => {
    if (!episodes?.length || !selectedEpisode || !cleanAnimeId) return;
    if (streamLoading || !(streamData?.sources?.length)) return;
    const idx = episodes.findIndex(e => e.id === selectedEpisode);
    if (idx >= 0 && idx < episodes.length - 1) {
      const next = episodes[idx + 1];
      const timeoutId = window.setTimeout(() => {
        prefetchNext(cleanAnimeId, next.id, audioType, next.number, anilistIdForPrefetch, anime?.title);
      }, 1500);
      return () => window.clearTimeout(timeoutId);
    }
  }, [episodes, selectedEpisode, cleanAnimeId, audioType, prefetchNext, anilistIdForPrefetch, streamLoading, streamData, anime?.title]);

  // Helper: get/set per-anime audio preference
  const getAnimeAudioPref = useCallback((animeId: string): AudioType | null => {
    try {
      const prefs = JSON.parse(localStorage.getItem('anime_audio_prefs') || '{}');
      return prefs[animeId] || null;
    } catch {
      return null;
    }
  }, []);

  const setAnimeAudioPref = useCallback((animeId: string, type: AudioType) => {
    try {
      const prefs = JSON.parse(localStorage.getItem('anime_audio_prefs') || '{}');
      prefs[animeId] = type;
      localStorage.setItem('anime_audio_prefs', JSON.stringify(prefs));
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Auto-switch to dub when available, unless user manually chose sub for this anime
  useEffect(() => {
    if (!currentEpisode || !anime || streamLoading) return;
    if (audioManuallySet) return;
    
    // Don't switch once a stream is already loaded or is currently loading — 
    // late-resolving metadata (dubCount) would otherwise destroy a working 
    // stream or cause infinite toggle loops during fallback transitions.
    if ((streamData?.sources?.length ?? 0) > 0) return;

    const animeId = cleanAnimeId || anime.id;
    const storedPref = getAnimeAudioPref(animeId);

    // Only trust confirmed dub signals — serversHaveDub is NOT used here because streaming
    // sources (e.g. AnimeKai) return a 'dub' server entry for every anime even when no dubbed
    // content exists, which causes a 404 → error loop on sub-only titles.
    const currentHasDub =
      currentEpisode.hasDub ||
      (anime.dubCount != null && anime.dubCount > 0 && currentEpisode.number <= anime.dubCount) ||
      dubProbeHasSources;

    // If user explicitly chose sub for this anime, respect it
    if (storedPref === 'sub') {
      if (audioType !== 'sub') setAudioType('sub');
      return;
    }

    // If user explicitly chose dub for this anime, respect it
    if (storedPref === 'dub') {
      if (audioType !== 'dub') setAudioType('dub');
      return;
    }

    // No stored preference: keep sub for fast first playback (dub is prefetched in background).
  }, [
    currentEpisode, 
    anime, 
    audioManuallySet, 
    streamData, 
    streamLoading, 
    audioType,
    anime?.dubCount, 
    dubProbeHasSources, 
    cleanAnimeId, 
    getAnimeAudioPref
  ]);

  // Store user's manual audio choice when they change it
  useEffect(() => {
    if (audioManuallySet && anime) {
      const animeId = cleanAnimeId || anime.id;
      setAnimeAudioPref(animeId, audioType);
    }
  }, [audioManuallySet, audioType, anime, cleanAnimeId, setAnimeAudioPref]);

  // Reset manual audio choice when switching episodes
  useEffect(() => {
    setAudioManuallySet(false);
  }, [selectedEpisode]);

  // Mobile: Unlock orientation when leaving the watch page
  useEffect(() => {
    if (!isMobile()) return;
    return () => {
      try {
        if (screen.orientation && (screen.orientation as any).unlock) {
          (screen.orientation as any).unlock();
        }
      } catch (e) { /* ignore */ }
    };
  }, [isMobile]);

  // Get watch progress for an episode from localStorage
  const getEpisodeProgress = useCallback((epNumber: number): number => {
    try {
      const key = `video-position-${cleanAnimeId}-${epNumber}`;
      const saved = localStorage.getItem(key);
      if (!saved) return 0;
      const position = parseFloat(saved);
      const historyJSON = localStorage.getItem('anistream_watch_history');
      if (historyJSON) {
        const history = JSON.parse(historyJSON);
        const item = history.find((h: any) => h.animeId === cleanAnimeId && h.episodeNumber === epNumber);
        if (item?.duration > 0) return Math.min(1, position / item.duration);
      }
      return position > 0 ? Math.min(1, position / (24 * 60)) : 0;
    } catch { return 0; }
  }, [cleanAnimeId]);


  const progressByEpisode = useMemo(() => {
    const map = new Map<number, number>();
    const entry = WatchHistory.get().find((h) => h.animeId === cleanAnimeId || h.animeId === anime?.id);
    if (entry) map.set(entry.episodeNumber, entry.progress);
    return map;
  }, [cleanAnimeId, anime?.id, selectedEpisodeNum]);

  if (animeLoading) {
    if (isMobile()) {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col">
          <div className="w-full bg-zinc-900 aspect-[16/9] shimmer" />
          <div className="px-3 py-3 bg-zinc-900/80 border-b border-white/[0.05]">
            <div className="h-8 w-full rounded-lg shimmer" />
          </div>
          <div className="px-3 pt-4 space-y-2">
            <div className="h-4 w-28 rounded shimmer mb-3" />
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-[58px] rounded-xl shimmer" />
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container py-8">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="aspect-video w-full rounded-xl" />
              <Skeleton className="h-12 w-full" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-64 w-full rounded-xl" />
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Show loading state while resolving slug or loading anime
  if (isResolving || animeLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-16 h-16 text-fox-orange animate-spin mb-4" />
            <h2 className="text-2xl font-bold mb-2">
              {isResolving ? 'Resolving anime...' : 'Loading anime...'}
            </h2>
            <p className="text-muted-foreground">
              {isResolving ? 'Finding the right source for this anime...' : 'Please wait while we load the anime details.'}
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (animeError || !anime) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Anime Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The anime you&apos;re looking for doesn&apos;t exist or couldn&apos;t be loaded.
            </p>
            <Button onClick={() => navigate('/')} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (episodesLoading || (episodesFetching && episodes === undefined)) {
    if (isMobile()) {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col">
          <div className="w-full bg-zinc-900 aspect-[16/9] relative overflow-hidden">
            {anime?.image && (
              <img src={anime.image} alt="" className="w-full h-full object-cover blur-lg opacity-30 scale-110" referrerPolicy="no-referrer" />
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="relative w-10 h-10">
                  <div className="absolute inset-0 rounded-full border-[3px] border-fox-orange/20" />
                  <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-fox-orange animate-spin" />
                </div>
                <p className="text-white/60 text-xs">Loading episodes…</p>
              </div>
            </div>
          </div>
          <div className="px-3 py-3 bg-zinc-900/80 border-b border-white/[0.05]">
            <div className="h-8 w-full rounded-lg shimmer" />
          </div>
          <div className="px-3 pt-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-[58px] rounded-xl shimmer" />
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container py-8">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="aspect-video w-full rounded-xl" />
              <Skeleton className="h-12 w-full" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-64 w-full rounded-xl" />
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!episodes || episodes.length === 0) {
    const isServerError = !!episodesError;
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <AlertCircle className={`w-16 h-16 mb-4 ${isServerError ? 'text-red-500' : 'text-yellow-500'}`} />
            <h2 className="text-2xl font-bold mb-2">
              {isServerError ? 'Server Error' : 'No Episodes Found'}
            </h2>
            <p className="text-muted-foreground mb-6 text-center max-w-md">
              {isServerError ? (
                <>
                  The server returned an error while loading episodes. This is usually a temporary issue — the server may be starting up or overloaded.
                  <br /><br />
                  <span className="text-xs font-mono text-red-400/80">
                    {(episodesError as Error)?.message || 'Unknown server error'}
                  </span>
                </>
              ) : (
                <>
                  We couldn&apos;t find any episodes for this anime. This might be because:
                  <br /><br />
                  • The anime is not yet released
                  <br />
                  • It&apos;s a new entry that hasn&apos;t been added to streaming sources
                  <br />
                  • The AniList entry needs to be linked to streaming sources
                </>
              )}
            </p>

            <div className="flex flex-col gap-4 w-full max-w-md">
              {isServerError ? (
                <Button
                  onClick={() => refetchEpisodes()}
                  variant="default"
                  className="bg-fox-orange hover:bg-fox-orange/90"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
              ) : (
                <Button
                  onClick={() => navigate(`/browse?q=${encodeURIComponent(anime?.title || 'anime')}`)}
                  variant="default"
                  className="bg-fox-orange hover:bg-fox-orange/90"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Search for &quot;{anime?.title || 'anime'}&quot;
                </Button>
              )}

              {cleanAnimeId.startsWith('anilist-') && (
                <a
                  href={`https://anilist.co/anime/${cleanAnimeId.replace('anilist-', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-fox-orange text-center"
                >
                  View on AniList ({cleanAnimeId})
                </a>
              )}

              <Button onClick={() => navigate('/')} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // If the best available source is an embed page (HTML), show an iframe instead of VideoPlayer
  const embedFallbackUrl = (() => {
    if (!videoSource) return null;
    // Server-side flagged as embed fallback — use raw originalUrl so iframe JS works.
    // Skip domain-locked embeds (aniwaves/echovideo) — rendering them in our iframe
    // triggers "Embedding blocked on this site", so let the caller fail over instead.
    if ((videoSource as { isEmbed?: boolean }).isEmbed) {
      const raw = (videoSource as { originalUrl?: string }).originalUrl || videoSource.url || '';
      if (DOMAIN_LOCKED_EMBED.test(raw)) return null;
      return raw || null;
    }
    const raw = (videoSource as { originalUrl?: string }).originalUrl || videoSource.url || '';
    if (isEmbedUrl(raw)) return raw;
    if (videoSource.url?.includes('/api/stream/proxy?url=')) {
      const inner = decodeURIComponent(videoSource.url.split('/api/stream/proxy?url=')[1]?.split('&')[0] || '');
      if (isEmbedUrl(inner)) return inner;
    }
    return null;
  })();


  // One responsive layout for every screen — phones get the same stage, edge to edge.
  // Some adult releases only ever get a teaser on the source; say so instead of passing it off as the episode.
  const isPreviewOnly = Boolean((videoSource as { isPreview?: boolean } | null)?.isPreview);

  const episodeTitle = (() => {
    const own = currentEpisode?.title?.trim();
    if (own && own !== `Episode ${currentEpisode?.number}` && !/^episode\s*\d+$/i.test(own)) return own;
    return episodeDetails?.get(selectedEpisodeNum)?.title || '';
  })();

  return (
    <div
      className="relative flex min-h-screen flex-col bg-[hsl(236_38%_2.5%)]"
      style={atmosphereStyle(anime?.accentColor)}
    >
      <Navbar />

      <main className="flex-1">
        {/* ── Stage ─────────────────────────────────────────────────────────
            The player sits in its own dark band, edge to edge on phones and
            held to a comfortable width above, so nothing competes with it. */}
        <div className="relative border-b border-white/[0.05] bg-black/40">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -bottom-32 h-64 opacity-[0.16] blur-[90px]"
            style={{ background: 'hsl(var(--atmos))' }}
          />
          <div className="relative mx-auto w-full max-w-[100rem] px-0 sm:px-6 lg:px-10">
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-black sm:rounded-b-2xl" ref={playerRef}>
              {streamLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
                  <Loader2 className="h-7 w-7 animate-spin text-white/50" />
                  <div className="text-center">
                    <p className="text-sm text-white/80">Finding a source…</p>
                    {serverRetryCount > 0 && (
                      <p className="mt-1 text-[12px] text-white/40">
                        Server {serverRetryCount + 1} of {servers?.length || '?'}
                      </p>
                    )}
                  </div>
                </div>
              ) : embedFallbackUrl ? (
                <iframe
                  src={embedFallbackUrl}
                  className="absolute inset-0 h-full w-full border-0"
                  allowFullScreen
                  allow="autoplay; encrypted-media; picture-in-picture"
                  referrerPolicy="no-referrer"
                />
              ) : videoSource ? (
                <VideoPlayer
                  key={`${cleanAnimeId}-${selectedEpisodeNum}-${audioType}`}
                  src={videoSource?.url || ''}
                  isM3U8={videoSource?.isM3U8}
                  subtitles={streamData?.subtitles}
                  intro={streamData?.intro}
                  outro={streamData?.outro}
                  onError={handlePlayerError}
                  poster={episodeDetails?.get(selectedEpisodeNum)?.thumbnail || currentEpisode?.thumbnail || artwork?.banner || artwork?.trailerThumb || anime.banner || undefined}
                  onNextEpisode={handleNextEpisode}
                  hasNextEpisode={hasNext}
                  animeId={cleanAnimeId}
                  selectedEpisodeNum={selectedEpisodeNum}
                  animeTitle={anime.title}
                  animeImage={anime.image}
                  animeSeason={anime.season}
                  isAdult={adult}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-black px-6">
                  <div className="flex max-w-sm flex-col items-center text-center">
                    <AlertCircle className="h-7 w-7 text-amber-400/80" />
                    <p className="mt-4 text-[15px] text-white/90">No source for this episode</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-white/50">
                      {serverRetryCount >= (servers?.length || 0)
                        ? "Every source came back empty. It may not be out yet, or they're down right now."
                        : 'Still trying the other servers…'}
                    </p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                      <button
                        type="button"
                        onClick={() => {
                          setServerRetryCount(0);
                          setSourceRetryIndex(0);
                          setSelectedServer('');
                          setBypassCache(true);
                          refetchStream();
                        }}
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-white/10 px-5 text-[13px] text-white transition-colors hover:bg-white/[0.16]"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Try again
                      </button>
                      {servers && servers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const currentIndex = servers.findIndex((sv) => sv.name === selectedServer);
                            setSelectedServer(servers[(currentIndex + 1) % servers.length].name);
                          }}
                          className="text-[13px] text-white/60 transition-colors hover:text-white"
                        >
                          Switch server
                        </button>
                      )}
                    </div>
                    {streamError &&
                      streamError.name !== 'AbortError' &&
                      !streamError.message?.toLowerCase().includes('abort') && (
                        <p className="mt-5 max-w-full truncate font-mono text-[11px] text-red-400/70">
                          {streamError instanceof Error ? streamError.message : String(streamError)}
                        </p>
                      )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Now playing ───────────────────────────────────────────────── */}
        <div className="page-x pt-7">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
            <div className="min-w-0">
              <Link
                to={animeHref}
                className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="max-w-[40ch] truncate">{anime.title}</span>
              </Link>

              <h1 className="mt-3 text-[1.35rem] font-semibold leading-tight text-foreground sm:text-2xl">
                Episode {currentEpisode?.number || selectedEpisodeNum}
              </h1>
              {episodeTitle && (
                <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                  {episodeTitle}
                </p>
              )}
              {isPreviewOnly && (
                <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-amber-300/80">
                  Preview clip only — the source hasn't published the full episode yet.
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handlePrevEpisode}
                disabled={!hasPrev}
                className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] text-foreground/80 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.05] disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              <button
                type="button"
                onClick={handleNextEpisode}
                disabled={!hasNext}
                className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] text-foreground/80 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.05] disabled:opacity-30 disabled:hover:bg-transparent"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-7">
            <StreamingControls
              audioType={audioType}
              onAudioTypeChange={(type) => {
                setAudioManuallySet(true);
                setAudioType(type);
              }}
              quality={quality}
              onQualityChange={setQuality}
              availableQualities={streamData?.sources?.map((sv) => sv.quality) || []}
              servers={servers || []}
              selectedServer={selectedServer}
              onServerChange={(server) => {
                setSelectedServer(server);
                setUserPickedServer(true);
                setServerRetryCount(0);
              }}
              serversLoading={serversLoading}
              autoPlay={autoPlay}
              onAutoPlayChange={setAutoPlay}
              currentSource={streamData?.source}
              hasDub={dubAvailable}
              hasSub={currentEpisode?.hasSub !== false}
            />
          </div>
        </div>

        {/* ── Episodes ──────────────────────────────────────────────────── */}
        <section className="page-x page-bottom pt-14">
          <h2 className="mb-6 text-xl font-semibold">Episodes</h2>
          <WatchEpisodeGrid
            episodes={episodes || []}
            details={episodeDetails}
            currentEpisodeNum={selectedEpisodeNum}
            onEpisodeSelect={handleEpisodeSelect}
            isLoading={episodesLoading}
            progressByEpisode={progressByEpisode}
          />

          {episodes && episodes.length > 0 && (
            <div className="mt-12">
              <DownloadManager
                episodes={episodes}
                animeTitle={anime.title || 'Anime'}
                animeId={cleanAnimeId}
                audioType={audioType}
              />
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Watch;
