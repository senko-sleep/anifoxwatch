import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { EpisodeList } from '../components/player/EpisodeList';
import { StreamingControls } from '../components/player/StreamingControls';
import { DownloadManager } from '../components/player/DownloadManager';
import { useAnime, useEpisodes, useStreamingLinks, useEpisodeServers, useDubStreamProbe, usePrefetchNextEpisode, usePrefetchDubStream } from '@/hooks/useAnime';
import { ping } from '@/utils/keep-alive';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatRating } from '@/lib/utils';
import {
  ArrowLeft,
  Play,
  Star,
  Calendar,
  Clock,
  Tv,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Maximize2,
  MonitorPlay,
  RotateCw,
} from 'lucide-react';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { toast } from 'sonner';

type AudioType = 'sub' | 'dub';

const EMBED_DOMAINS = ['streamwish', 'mega.nz', 'hqq.tv', 'streamtape', 'doodstream', 'mp4upload', 'sendvid', 'ok.ru'];
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

const Watch = () => {
  const { animeId } = useParams<{ animeId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  // Get anime ID from search param (use route param as fallback for backwards compatibility)
  const cleanAnimeId = searchParams.get('id') || animeId || '';
  // Source from history (e.g. 'hanime', 'aki-h') so the API knows where to look
  const sourceParam = searchParams.get('source') || undefined;
  const navigate = useNavigate();
  const location = useLocation();

  // Store the referrer URL (browse URL with params) for going back
  const [backUrl, setBackUrl] = useState<string>('/browse');

  // Immediately ping the API on watch page mount to ensure the Vercel function is warm
  // before stream fetch begins — eliminates the cold-start delay users see on first load.
  useEffect(() => { ping(); }, []);

  useEffect(() => {
    // Try to get referrer from navigation state first,
    // then fall back to sessionStorage (saved by Search page)
    // then fall back to searchParams
    const savedBrowseUrl = sessionStorage.getItem('last_browse_url');

    if (location.state?.from) {
      setBackUrl(location.state.from);
    } else if (savedBrowseUrl) {
      setBackUrl(savedBrowseUrl);
    } else {
      // Build back URL from searchParams of current page (legacy fallback)
      const params = new URLSearchParams();
      const genre = searchParams.get('genre');
      const type = searchParams.get('type');
      const status = searchParams.get('status');
      const year = searchParams.get('year');
      const sort = searchParams.get('sort');
      const page = searchParams.get('page');
      const mode = searchParams.get('mode');

      if (genre) params.set('genre', genre);
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      if (year) params.set('year', year);
      if (sort && sort !== 'popularity') params.set('sort', sort);
      if (page && page !== '1') params.set('page', page);
      if (mode && mode !== 'safe') params.set('mode', mode);

      const queryString = params.toString();
      setBackUrl(queryString ? `/browse?${queryString}` : '/browse');
    }
  }, [location.state, searchParams]);

  // State
  const [selectedAnimeId, setSelectedAnimeId] = useState<string>(cleanAnimeId);
  const [selectedEpisode, setSelectedEpisode] = useState<string | null>(null);
  const [selectedEpisodeNum, setSelectedEpisodeNum] = useState<number>(1);
  const [audioType, setAudioType] = useState<AudioType>(() => {
    // Restore stored preference; default to dub — auto-falls back to sub if dub has no sources
    try {
      const animeId = new URLSearchParams(window.location.search).get('id') || '';
      const prefs = JSON.parse(localStorage.getItem('anime_audio_prefs') || '{}');
      if (prefs[animeId] === 'dub') return 'dub';
      if (prefs[animeId] === 'sub') return 'sub';
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
  const prevCleanAnimeIdRef = useRef<string>(cleanAnimeId);

  // Refs
  const playerRef = useRef<HTMLDivElement>(null);
  const lastPlayerErrorTimeRef = useRef<number>(0);
  const playerErrorDebounceMs = 2000; // Minimum time between retry attempts

  // Cinema mode state for layout adaptation
  const [isCinemaMode, setIsCinemaMode] = useState(false);

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
  const { data: anime, isLoading: animeLoading, error: animeError } = useAnime(cleanAnimeId || '', !!cleanAnimeId, sourceParam);
  const { data: episodes, isLoading: episodesLoading, isFetching: episodesFetching, error: episodesError, refetch: refetchEpisodes } = useEpisodes(cleanAnimeId || '', !!cleanAnimeId, sourceParam);
  const selectedEpisodeForCurrentAnime = selectedAnimeId === cleanAnimeId ? selectedEpisode : null;
  const { data: servers, isLoading: serversLoading } = useEpisodeServers(selectedEpisodeForCurrentAnime || '', !!selectedEpisodeForCurrentAnime);
  const serversHaveDub = useMemo(
    () => servers?.some((s) => s.type === 'dub') ?? false,
    [servers]
  );
  // Fire stream fetch immediately — don't wait for server list to load.
  // The backend defaults to 'auto' when no server is specified.
  // Only pass a server param when the user has explicitly chosen one.
  const [userPickedServer, setUserPickedServer] = useState(false);
  // Treat 'default' as no server preference — avoids a double-fetch when auto-select picks it
  const streamServer = userPickedServer && selectedServer && selectedServer.toLowerCase() !== 'default'
    ? selectedServer
    : undefined;
  const {
    data: streamData,
    isLoading: streamLoading,
    error: streamError,
    refetch: refetchStream
  } = useStreamingLinks(selectedEpisodeForCurrentAnime || '', streamServer, audioType, !!selectedEpisodeForCurrentAnime, selectedEpisodeNum,
    cleanAnimeId.startsWith('anilist-') ? parseInt(cleanAnimeId.replace('anilist-', ''), 10) || undefined : undefined, anime?.title);

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
    if (prevCleanAnimeIdRef.current === cleanAnimeId) return;
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

    const epParam = searchParams.get('ep');
    let targetEpisode = null;
    
    if (epParam) {
      const epNum = parseInt(epParam, 10);
      targetEpisode = episodes.find(e => e.number === epNum);
    }
    
    // If no URL param or episode not found, use first episode
    if (!targetEpisode) {
      targetEpisode = episodes[0];
    }
    
    // Always update selectedAnimeId and selectedEpisode (even if they were already set)
    // This ensures they're always in sync when episodes change
    setSelectedAnimeId(cleanAnimeId);
    setSelectedEpisode(targetEpisode.id);
    setSelectedEpisodeNum(targetEpisode.number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes, cleanAnimeId]);

  // Auto-select default server (neko_senko preferred) when servers are loaded
  useEffect(() => {
    if (!servers?.length || serversLoading) return;
    if (userPickedServer || selectedServer || (streamData?.sources?.length ?? 0) > 0) return;
    // Don't auto-select if stream is already loading to avoid aborting the initial fetch
    if (streamLoading) return;

    // Filter servers by current audio type (sub/dub), fall back to all servers
    const audioTypeServers = servers.filter(s =>
      audioType === 'dub' ? s.type === 'dub' : s.type === 'sub'
    );
    const targetServers = audioTypeServers.length > 0 ? audioTypeServers : servers;

    // Prefer neko_senko, otherwise pick the first available server (including 'default')
    const defaultServer = targetServers.find(s => s.name.toLowerCase().includes('neko_senko'))
      || targetServers[0];

    if (defaultServer) {
      console.log('[Watch] Auto-selecting default server:', defaultServer.name);
      setSelectedServer(defaultServer.name);
    }
  }, [servers, serversLoading, userPickedServer, audioType, streamLoading]);




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

  // Show "server warming up" hint after 8s of loading — lets users know the server is working
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

  // Get best quality source - skip sources that previously failed
  const getVideoSource = useCallback(() => {
    if (!streamData?.sources?.length) return null;

    // Filter out sources that previously had errors (simple retry tracking)
    // Also skip IP-locked sources (Streamtape /get_video) — cannot be proxied through serverless
    const sources = streamData.sources
      .filter((_, idx) => idx >= sourceRetryIndex)
      .filter((s) => !s.ipLocked);

    if (!sources.length) return null;

    // Prefer sources that are actually playable (M3U8 / direct MP4)
    const playable = sources.filter((s) => {
      const raw = (s as { originalUrl?: string }).originalUrl || s.url || '';
      const lower = raw.toLowerCase();
      // Streamtape /get_video URLs are IP-locked — skip them even without the flag
      if ((lower.includes('streamtape') || lower.includes('tapecontent')) && lower.includes('get_video')) return false;
      return lower.includes('.m3u8') || lower.includes('.mp4') || lower.includes('.mpd') ||
             !EMBED_DOMAINS.some((d) => lower.includes(d));
    });
    if (playable.length > 0) return playable[0];

    // No playable sources — fall back to first source (will trigger embed fallback)
    return sources[0];
  }, [streamData, quality, sourceRetryIndex]);


  // Episode navigation with smooth transitions
  const handleEpisodeSelect = useCallback((episodeId: string, episodeNum: number) => {
    // Prevent unnecessary re-renders if same episode
    if (episodeId === selectedEpisode) return;

    // Set switching state to prevent URL conflicts
    setIsSwitchingEpisode(true);

    // Update URL first, then state
    const currentEpParam = searchParams.get('ep');
    const newEpParam = String(episodeNum);

    if (currentEpParam !== newEpParam) {
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.set('ep', newEpParam);
        return newParams;
      }, { replace: true, state: location.state });
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
  }, [selectedEpisode, searchParams, setSearchParams]);

  const handlePrevEpisode = useCallback(() => {
    if (!episodes?.length) return;
    const currentIndex = episodes.findIndex(e => e.id === selectedEpisode);
    if (currentIndex > 0) {
      const prev = episodes[currentIndex - 1];
      handleEpisodeSelect(prev.id, prev.number);
    }
  }, [episodes, selectedEpisode, handleEpisodeSelect]);

  const handleNextEpisode = useCallback(() => {
    if (!episodes?.length) return;
    const currentIndex = episodes.findIndex(e => e.id === selectedEpisode);
    if (currentIndex < episodes.length - 1) {
      const next = episodes[currentIndex + 1];
      handleEpisodeSelect(next.id, next.number);
    }
  }, [episodes, selectedEpisode, handleEpisodeSelect]);

  // Current episode info
  const currentEpisode = episodes?.find(e => e.id === selectedEpisode);
  const hasPrev = episodes?.findIndex(e => e.id === selectedEpisode) > 0;
  const hasNext = episodes ? episodes.findIndex(e => e.id === selectedEpisode) < episodes.length - 1 : false;

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

  const videoSource = getVideoSource();

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

  // Mobile: immersive layout — full-width player, no navbar, episodes first
  if (isMobile()) {
    return (
      <div className="min-h-screen flex flex-col bg-zinc-950">
        {/* Full-width player — edge to edge, no side gaps */}
        <div className="w-full bg-black sticky top-0 z-20" ref={playerRef}>
          <div className="relative w-full aspect-[16/9]">
          {streamLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 overflow-hidden">
                {anime?.image && (
                  <img src={anime.image} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-25 pointer-events-none" referrerPolicy="no-referrer" />
                )}
                <div className="relative flex flex-col items-center gap-3">
                  <div className="relative w-12 h-12">
                    <div className="absolute inset-0 rounded-full border-[3px] border-fox-orange/20" />
                    <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-fox-orange animate-spin" />
                  </div>
                  <p className="text-white/70 text-xs font-medium">Loading stream…</p>
                  {streamSlowWarning && (
                    <p className="text-white/40 text-[10px] text-center max-w-[180px]">Server warming up — may take ~30 s</p>
                  )}
                </div>
              </div>
            ) : embedFallbackUrl ? (
              <iframe
                src={embedFallbackUrl}
                className="absolute inset-0 w-full h-full border-0"
                allowFullScreen
                allow="autoplay; encrypted-media; picture-in-picture"
                referrerPolicy="no-referrer"
              />
            ) : videoSource ? (
              <VideoPlayer
                key={`${cleanAnimeId}:${selectedEpisodeForCurrentAnime || 'none'}:${audioType}`}
                src={videoSource?.url || ''}
                isM3U8={videoSource?.isM3U8}
                subtitles={streamData?.subtitles}
                intro={streamData?.intro}
                outro={streamData?.outro}
                onError={handlePlayerError}
                poster={anime?.image}
                onNextEpisode={handleNextEpisode}
                hasNextEpisode={hasNext}
                animeId={cleanAnimeId}
                selectedEpisodeNum={selectedEpisodeNum}
                animeTitle={anime?.title}
                animeImage={anime?.image}
                animeSeason={anime?.season}
                onBack={() => navigate(backUrl)}
              />
) : (
               <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
                 <div className="text-center p-6">
                   <AlertCircle className="w-10 h-10 text-yellow-500 mx-auto mb-3" />
                   <p className="text-white font-medium text-sm">No stream available</p>
                   <Button size="sm" className="mt-3 bg-fox-orange" onClick={() => { 
                     setServerRetryCount(0); 
                     setSourceRetryIndex(0);
                     refetchStream(); 
                   }}>
                     <RefreshCw className="w-4 h-4 mr-2" />Retry
                   </Button>
                 </div>
               </div>
             )}
          </div>
        </div>

        <main className="flex-1">
          {/* Episode nav + title + sub/dub — premium compact bar */}
          <div className="px-3 py-2.5 bg-gradient-to-b from-zinc-900 to-zinc-900/80 border-b border-white/[0.06] backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(backUrl)} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.06] active:bg-white/[0.12] touch-manipulation border border-white/[0.05]">
                <ArrowLeft className="w-4 h-4 text-white/80" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] text-fox-orange font-bold uppercase tracking-widest truncate leading-none mb-0.5">{anime?.title}</p>
                <p className="text-[12px] font-semibold text-white truncate leading-snug">
                  Episode {currentEpisode?.number || selectedEpisodeNum}
                  {currentEpisode?.title && currentEpisode.title !== `Episode ${currentEpisode.number}` && (
                    <span className="text-zinc-400 font-normal text-[11px]"> — {currentEpisode.title}</span>
                  )}
                </p>
              </div>
              {/* Sub/Dub pill toggle */}
              <div className="flex items-center rounded-lg overflow-hidden border border-white/[0.08] shrink-0">
                {(currentEpisode?.hasSub !== false) && (
                  <button
                    onClick={() => { setAudioManuallySet(true); setAudioType('sub'); }}
                    className={cn("px-2.5 py-1.5 text-[10px] font-bold touch-manipulation transition-colors",
                      audioType === 'sub' ? "bg-fox-orange text-white" : "bg-transparent text-white/50 active:bg-white/5")}
                  >SUB</button>
                )}
                {dubAvailable && (
                  <button
                    onClick={() => { setAudioManuallySet(true); setAudioType('dub'); }}
                    className={cn("px-2.5 py-1.5 text-[10px] font-bold touch-manipulation transition-colors",
                      audioType === 'dub' ? "bg-green-500 text-white" : "bg-transparent text-white/50 active:bg-white/5")}
                  >DUB</button>
                )}
              </div>
              {/* Landscape mode */}
              <button
                onClick={handleLandscapeMode}
                title={isLandscapeLocked ? 'Unlock orientation' : 'Watch in landscape'}
                className={cn(
                  "w-8 h-8 flex items-center justify-center rounded-xl touch-manipulation transition-all shrink-0 border",
                  isLandscapeLocked
                    ? "bg-fox-orange/20 text-fox-orange border-fox-orange/30"
                    : "bg-white/[0.06] text-white/60 active:bg-white/[0.12] border-white/[0.05]"
                )}
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              {/* Prev/Next */}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={handlePrevEpisode} disabled={!hasPrev}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.06] disabled:opacity-25 active:bg-white/[0.12] touch-manipulation border border-white/[0.05]">
                  <ChevronLeft className="w-4 h-4 text-white" />
                </button>
                <button onClick={handleNextEpisode} disabled={!hasNext}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.06] disabled:opacity-25 active:bg-white/[0.12] touch-manipulation border border-white/[0.05]">
                  <ChevronRight className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Server selector — compact, only shown when servers are loaded */}
          {servers && servers.filter(s => s.name.toLowerCase() !== 'default').length > 1 && (
            <div className="px-3 py-2 bg-zinc-900/40 border-b border-white/[0.04] flex items-center gap-2 overflow-x-auto scrollbar-none">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest shrink-0 font-semibold">Server</span>
              {servers.filter(s => s.name.toLowerCase() !== 'default').map(s => (
                <button
                  key={s.name}
                  onClick={() => { setSelectedServer(s.name); setUserPickedServer(true); setServerRetryCount(0); }}
                  className={cn(
                    "shrink-0 px-3 py-1 rounded-full text-[10px] font-semibold touch-manipulation transition-all",
                    selectedServer === s.name
                      ? "bg-fox-orange text-white shadow-sm shadow-fox-orange/30"
                      : "bg-white/[0.06] text-white/50 active:bg-white/[0.12] border border-white/[0.06]"
                  )}
                >{s.name}</button>
              ))}
            </div>
          )}

          {/* Episode List — Premium 2-column card grid */}
          <div className="px-3 pt-4 pb-2">
            {/* Section header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-fox-orange" />
                <p className="text-[11px] font-bold text-white/90 uppercase tracking-wider">Episodes</p>
                <span className="text-[10px] text-zinc-600 font-medium">{episodes?.length || 0}</span>
              </div>
              {/* Watched count */}
              {(() => {
                const watchedCount = episodes?.filter(ep => {
                  const prog = getEpisodeProgress(ep.number);
                  return prog >= 0.9;
                }).length || 0;
                return watchedCount > 0 ? (
                  <span className="text-[10px] text-green-500/80 font-medium">✓ {watchedCount} watched</span>
                ) : null;
              })()}
            </div>

            {/* 2-column card grid */}
            <div className="grid grid-cols-2 gap-2">
              {episodes?.map((ep) => {
                const progress = getEpisodeProgress(ep.number);
                const isActive = selectedEpisode === ep.id;
                const isWatched = progress >= 0.9;
                const isInProgress = progress > 0.02 && progress < 0.9;
                return (
                  <button
                    key={ep.id}
                    onClick={() => handleEpisodeSelect(ep.id, ep.number)}
                    className={cn(
                      "relative rounded-xl text-left overflow-hidden touch-manipulation active:scale-[0.97] transition-all duration-150 flex flex-col",
                      isActive
                        ? "ring-2 ring-fox-orange shadow-lg shadow-fox-orange/30"
                        : isWatched
                        ? "bg-white/[0.025] border border-white/[0.04]"
                        : "bg-white/[0.05] border border-white/[0.07] active:bg-white/[0.09]"
                    )}
                  >
                    {/* Card body */}
                    <div className="flex flex-col p-2.5 gap-1.5 flex-1">
                      {/* Episode number pill */}
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold flex-shrink-0",
                          isActive
                            ? "bg-fox-orange/90 text-white"
                            : isWatched
                            ? "bg-green-500/15 text-green-500"
                            : "bg-white/[0.08] text-white/70"
                        )}>
                          {isActive ? (
                            <Play className="w-3 h-3 fill-current" />
                          ) : isWatched ? (
                            <span className="text-[10px]">✓</span>
                          ) : (
                            ep.number
                          )}
                        </span>

                        {/* Progress badge or sub/dub */}
                        <div className="flex items-center gap-1 ml-1">
                          {isWatched && !isActive && (
                            <span className="text-[9px] font-bold text-green-500 bg-green-500/10 px-1 py-0.5 rounded">Done</span>
                          )}
                          {isInProgress && !isActive && (
                            <span className="text-[9px] font-bold text-fox-orange bg-fox-orange/10 px-1 py-0.5 rounded">{Math.round(progress * 100)}%</span>
                          )}
                          {!isWatched && !isInProgress && (() => {
                            const effectiveDubCount = anime?.dubCount ?? 0;
                            const epHasDub = ep.hasDub || dubAvailable || (effectiveDubCount > 0 && ep.number <= effectiveDubCount);
                            return epHasDub ? (
                              <span className="text-[9px] text-green-500/70 font-medium">DUB</span>
                            ) : null;
                          })()}
                        </div>
                      </div>

                      {/* Episode title */}
                      <p className={cn(
                        "text-[11px] leading-snug line-clamp-2 font-medium",
                        isActive ? "text-white" : isWatched ? "text-white/40" : "text-white/75"
                      )}>
                        {ep.title && ep.title !== `Episode ${ep.number}` ? ep.title : `Episode ${ep.number}`}
                      </p>
                    </div>

                    {/* Active glow gradient */}
                    {isActive && (
                      <div className="absolute inset-0 bg-fox-orange/10 pointer-events-none" />
                    )}

                    {/* Progress bar at bottom */}
                    {progress > 0 && (
                      <div className="h-[3px] bg-white/[0.06] w-full flex-shrink-0">
                        <div
                          className={cn(
                            "h-full transition-all duration-500",
                            isWatched ? "bg-green-500" : "bg-fox-orange"
                          )}
                          style={{ width: `${Math.min(100, progress * 100)}%` }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* About — compact card at the bottom */}
          <div className="px-3 pt-2 pb-safe pb-6">
            <div className="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <img src={anime?.image} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover shadow-lg" referrerPolicy="no-referrer" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white leading-tight truncate">{anime?.title}</p>
                {anime?.titleJapanese && <p className="text-[10px] italic text-zinc-500 truncate mt-0.5">{anime.titleJapanese}</p>}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {formatRating(anime?.rating) && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                      <Star className="h-2.5 w-2.5 fill-current" />{formatRating(anime?.rating)}
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-400 bg-white/5 px-1.5 py-0.5 rounded">{anime?.type}</span>
                  {anime?.status && <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded",
                    anime.status === 'Ongoing' ? "text-green-400 bg-green-500/10" :
                    anime.status === 'Completed' ? "text-blue-400 bg-blue-500/10" : "text-yellow-400 bg-yellow-500/10"
                  )}>{anime.status}</span>}
                </div>
                {plainDescription(anime?.description) && (
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 line-clamp-3">{plainDescription(anime?.description)}</p>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Desktop: Regular layout
  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-x-hidden">
      {/* Cinematic Backdrop */}
      {anime?.cover && (
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none select-none overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />
          <img
            src={anime.cover}
            alt="Backdrop"
            className="w-full h-full object-cover blur-3xl scale-110"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      <Navbar />

      <main className={cn(
        "flex-1 relative z-10 transition-all duration-500",
        isCinemaMode && "pt-[calc(56.25vw+2rem)] md:pt-[calc(56.25vw+3rem)] lg:pt-[calc(56.25vw+4rem)]"
      )}>
        <div className={cn(
          "max-w-[95vw] mx-auto px-4 pb-12 transition-all duration-500",
          isCinemaMode ? "pt-6" : "pt-6"
        )}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(backUrl)}
            className={cn(
              "text-muted-foreground hover:text-foreground hover:bg-white/10 mb-6 transition-all duration-300",
              isCinemaMode && "opacity-0 pointer-events-none h-0 mb-0 overflow-hidden"
            )}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Browse
          </Button>

          <div className={cn(
            "grid gap-6 lg:gap-8 transition-all duration-500",
            isCinemaMode
              ? "lg:grid-cols-1 max-w-7xl mx-auto"
              : "lg:grid-cols-12"
          )}>
            {/* Main Player Area */}
            <div className={cn(
              "space-y-6 transition-all duration-500",
              isCinemaMode ? "lg:col-span-1 w-full" : "lg:col-span-9"
            )} ref={playerRef}>
              {/* Video Player Container */}
              <div className="relative group">
                <div className="relative aspect-[16/9] bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                  <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/20 pointer-events-none z-10" />
                  {/* HD Effect overlay */}
                  <div className="absolute inset-0 pointer-events-none z-10">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-black/5" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/5 via-transparent to-black/5" />
                  </div>
                  {streamLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-12 h-12 animate-spin text-fox-orange" />
                        <div className="text-center">
                          <p className="text-lg font-medium text-white">Loading Stream...</p>
                          <p className="text-sm text-zinc-400">
                            {serverRetryCount > 0
                              ? `Trying server ${serverRetryCount + 1} of ${servers?.length || '?'}...`
                              : 'Finding best quality source'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : embedFallbackUrl ? (
                    <iframe
                      src={embedFallbackUrl}
                      className="absolute inset-0 w-full h-full border-0"
                      allowFullScreen
                      allow="autoplay; encrypted-media; picture-in-picture"
                      referrerPolicy="no-referrer"
                    />
                  ) : videoSource ? (
                    <VideoPlayer
                      key={`${cleanAnimeId}:${selectedEpisodeForCurrentAnime || 'none'}:${audioType}`}
                      src={videoSource?.url || ''}
                      isM3U8={videoSource?.isM3U8}
                      subtitles={streamData?.subtitles}
                      intro={streamData?.intro}
                      outro={streamData?.outro}
                      onError={handlePlayerError}
                      poster={anime.image}
                      onNextEpisode={handleNextEpisode}
                      hasNextEpisode={hasNext}
                      animeId={cleanAnimeId}
                      selectedEpisodeNum={selectedEpisodeNum}
                      animeTitle={anime.title}
                      animeImage={anime.image}
                      animeSeason={anime.season}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                      <div className="flex flex-col items-center gap-6 text-center p-8 max-w-md bg-zinc-950/50 rounded-xl border border-white/5 backdrop-blur-md">
                        <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center">
                          <AlertCircle className="w-8 h-8 text-yellow-500" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-white mb-2">No Stream Available</h3>
                          <p className="text-zinc-400 text-sm leading-relaxed">
                            {serverRetryCount >= (servers?.length || 0)
                              ? 'We couldn\'t find a working stream for this episode. It might be unreleased or the servers are currently down.'
                              : 'We\'re having trouble connecting to the stream. Attempting to switch servers...'}
                          </p>
                        </div>
                        <div className="flex flex-col w-full gap-3">
<Button
                             variant="default"
                             className="w-full bg-fox-orange hover:bg-fox-orange/90"
                             onClick={() => {
                               setServerRetryCount(0);
                               setSourceRetryIndex(0);
                               setSelectedServer('');
                               refetchStream();
                             }}
                           >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Retry Connection
                          </Button>
                          {servers && servers.length > 1 && (
                            <Button
                              variant="outline"
                              className="w-full border-white/10 hover:bg-white/5"
                              onClick={() => {
                                const currentIndex = servers.findIndex(s => s.name === selectedServer);
                                const nextServer = servers[(currentIndex + 1) % servers.length];
                                setSelectedServer(nextServer.name);
                              }}
                            >
                              Switch Server
                            </Button>
                          )}
                        </div>
                        {streamError && streamError.name !== 'AbortError' && !streamError.message?.toLowerCase().includes('abort') && (
                          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg w-full">
                            <p className="text-xs text-red-400 font-mono text-left">
                              Error: {streamError instanceof Error ? streamError.message :
                                      typeof streamError === 'object' ?
                                        (streamError as any).message ||
                                        (streamError as any).error ||
                                        JSON.stringify(streamError, Object.getOwnPropertyNames(streamError).filter(k => typeof (streamError as any)[k] !== 'function')) :
                                        String(streamError)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Episode Navigation & Details */}
              <div className={cn(
                "grid grid-cols-[1fr_auto] gap-3 items-center bg-card/30 backdrop-blur-md border border-white/5 p-4 rounded-xl transition-all duration-500",
                isCinemaMode && "max-w-4xl mx-auto"
              )}>
                <div className="min-w-0">
                  <h2 className="text-lg md:text-xl font-bold truncate">
                    Episode {currentEpisode?.number || selectedEpisodeNum}
                    {currentEpisode?.title && currentEpisode.title !== `Episode ${currentEpisode.number}` && (
                      <span className="text-muted-foreground font-normal ml-2 text-sm md:text-base">
                        - {currentEpisode.title}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs md:text-sm text-muted-foreground mt-1">
                    <a
                      href={`/browse?q=${encodeURIComponent(anime.title)}`}
                      className="hover:text-fox-orange hover:underline transition-colors cursor-pointer"
                      title={`Search for "${anime.title}" - ID: ${cleanAnimeId}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/browse?q=${encodeURIComponent(anime.title)}`);
                      }}
                    >
                      {anime.title}
                    </a>
                    {cleanAnimeId.startsWith('anilist-') && (
                      <span className="ml-2 text-xs text-yellow-500/70" title="This is an AniList ID - episodes may need to be resolved via search">
                        (AniList)
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCinemaMode(!isCinemaMode)}
                    className={cn(
                      "hidden lg:flex gap-2 border-white/10 hover:bg-white/5 h-10 px-4 transition-colors",
                      isCinemaMode && "bg-fox-orange/20 border-fox-orange/50 text-fox-orange"
                    )}
                    title={isCinemaMode ? "Exit Cinema Mode" : "Enter Cinema Mode"}
                  >
                    {isCinemaMode ? <MonitorPlay className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    <span>Cinema</span>
                  </Button>

                  <div className="h-4 w-[1px] bg-white/10 hidden lg:block mx-1" />

                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handlePrevEpisode}
                    disabled={!hasPrev}
                    className="gap-1 sm:gap-2 border-white/10 hover:bg-white/5 h-10 sm:h-12 px-3 sm:px-4 touch-manipulation"
                  >
                    <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                    <span className="hidden sm:inline">Prev</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleNextEpisode}
                    disabled={!hasNext}
                    className="gap-1 sm:gap-2 border-white/10 hover:bg-white/5 h-10 sm:h-12 px-3 sm:px-4 touch-manipulation"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                  </Button>
                </div>
              </div>

              {/* Streaming Controls */}
              <div className={cn(
                "transition-all duration-500",
                isCinemaMode && "max-w-4xl mx-auto"
              )}>
                <StreamingControls
                  audioType={audioType}
                  onAudioTypeChange={(type) => {
                    setAudioManuallySet(true);
                    setAudioType(type);
                  }}
                  quality={quality}
                  onQualityChange={setQuality}
                  availableQualities={streamData?.sources?.map(s => s.quality) || []}
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

              {/* Download Manager */}
              {episodes && episodes.length > 0 && (
                <div className={cn(
                  "transition-all duration-500",
                  isCinemaMode && "max-w-4xl mx-auto"
                )}>
                  <DownloadManager
                    episodes={episodes}
                    animeTitle={anime.title || 'Anime'}
                    animeId={cleanAnimeId}
                    audioType={audioType}
                  />
                </div>
              )}

              {/* Single about block below the player */}
              <div className={cn(
                'rounded-xl border border-white/5 bg-card/30 p-5 shadow-xl backdrop-blur-md transition-all duration-500 sm:p-6',
                isCinemaMode && 'mx-auto max-w-4xl'
              )}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">About</h2>
                <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
                  <img
                    src={anime.image}
                    alt=""
                    className="mx-auto h-40 w-28 shrink-0 rounded-lg object-cover ring-1 ring-white/10 sm:mx-0 sm:h-44 sm:w-32"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <h3 className="font-display text-lg font-bold text-white sm:text-xl md:text-2xl">{anime.title}</h3>
                    {anime.titleJapanese && (
                      <p className="mt-1 text-sm italic text-muted-foreground">{anime.titleJapanese}</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                      {formatRating(anime.rating) && (
                        <Badge variant="secondary" className="gap-1 border-yellow-500/20 bg-yellow-500/10 text-yellow-500">
                          <Star className="h-3 w-3 fill-current" />
                          {formatRating(anime.rating)}
                        </Badge>
                      )}
                      <Badge variant="outline" className="border-white/10">{anime.type}</Badge>
                      {anime.status && (
                        <Badge
                          variant="outline"
                          className={
                            anime.status === 'Ongoing'
                              ? 'border-green-500/50 bg-green-500/10 text-green-500'
                              : anime.status === 'Completed'
                                ? 'border-blue-500/50 bg-blue-500/10 text-blue-500'
                                : 'border-yellow-500/50 bg-yellow-500/10 text-yellow-500'
                          }
                        >
                          {anime.status}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground sm:justify-start">
                      {(anime.season || anime.year != null) && (
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 opacity-80" />
                          {[anime.season, anime.year].filter((v) => v != null && v !== '').join(' ')}
                        </span>
                      )}
                      {anime.duration && (
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 opacity-80" />
                          {anime.duration}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <Tv className="h-3.5 w-3.5 opacity-80" />
                        {anime.episodes || '?'} episodes
                      </span>
                    </div>
                    {anime.genres?.length > 0 && (
                      <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                        {anime.genres.map((genre) => (
                          <Badge key={genre} variant="secondary" className="text-xs bg-white/5">
                            {genre}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {plainDescription(anime.description) ? (
                      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                        {plainDescription(anime.description)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Episode List Sidebar - Hidden in cinema mode */}
            <div className={cn(
              "lg:col-span-3 transition-all duration-500",
              isCinemaMode && "hidden lg:hidden"
            )}>
              <div className="bg-card/30 backdrop-blur-md border border-white/5 rounded-xl h-[calc(100vh-140px)] flex flex-col sticky top-24">
                <div className="flex-1 overflow-hidden">
                  <EpisodeList
                    episodes={episodes || []}
                    selectedEpisodeId={selectedEpisode}
                    onEpisodeSelect={handleEpisodeSelect}
                    isLoading={episodesLoading}
                    anime={anime}
                    serversHaveDub={dubAvailable}
                    dubCount={anime?.dubCount ?? 0}
                    animeId={cleanAnimeId}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Watch;
