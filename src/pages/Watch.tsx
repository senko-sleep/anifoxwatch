import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { EpisodeList } from '../components/player/EpisodeList';
import { StreamingControls } from '../components/player/StreamingControls';
import { useAnime, useEpisodes, useStreamingLinks, useEpisodeServers, useDubStreamProbe } from '@/hooks/useAnime';
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
} from 'lucide-react';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { toast } from 'sonner';

type AudioType = 'sub' | 'dub';
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
  const navigate = useNavigate();
  const location = useLocation();

  // Store the referrer URL (browse URL with params) for going back
  const [backUrl, setBackUrl] = useState<string>('/browse');

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
  const [selectedEpisode, setSelectedEpisode] = useState<string | null>(null);
  const [selectedEpisodeNum, setSelectedEpisodeNum] = useState<number>(1);
  const [audioType, setAudioType] = useState<AudioType>('dub');
  const [audioManuallySet, setAudioManuallySet] = useState(false);
  const [quality, setQuality] = useState<QualityType>('auto');
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [autoPlay, setAutoPlay] = useState(true);
  const [serverRetryCount, setServerRetryCount] = useState(0);
  const [sourceRetryIndex, setSourceRetryIndex] = useState(0);
  const [isSwitchingEpisode, setIsSwitchingEpisode] = useState(false);

  // Refs
  const playerRef = useRef<HTMLDivElement>(null);
  const lastPlayerErrorTimeRef = useRef<number>(0);
  const playerErrorDebounceMs = 2000; // Minimum time between retry attempts

  // Cinema mode state for layout adaptation
  const [isCinemaMode, setIsCinemaMode] = useState(false);

  // (Mobile overlay state removed — mobile now uses inline page layout)

  // Helper to detect mobile
  const isMobile = useCallback(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  }, []);

  // Data fetching
  const { data: anime, isLoading: animeLoading, error: animeError } = useAnime(cleanAnimeId || '', !!cleanAnimeId);
  const { data: episodes, isLoading: episodesLoading, isFetching: episodesFetching } = useEpisodes(cleanAnimeId || '', !!cleanAnimeId);
  const { data: servers, isLoading: serversLoading } = useEpisodeServers(selectedEpisode || '', !!selectedEpisode);
  const serversHaveDub = useMemo(
    () => servers?.some((s) => s.type === 'dub') ?? false,
    [servers]
  );
  const {
    data: streamData,
    isLoading: streamLoading,
    error: streamError,
    refetch: refetchStream
  } = useStreamingLinks(selectedEpisode || '', selectedServer || undefined, audioType, !!selectedEpisode);

  /** Dub is available if: server list has dub, metadata says dub, active dub playback returned sources, or dub probe (while on SUB) succeeded. */
  const metadataIndicatesDub = useMemo(
    () => (anime?.dubCount ?? 0) > 0 || (episodes?.some((e) => e.hasDub) ?? false),
    [anime, episodes]
  );
  const dubPlaybackWorks =
    audioType === 'dub' && (streamData?.sources?.length ?? 0) > 0;
  const skipDubProbe =
    serversHaveDub ||
    metadataIndicatesDub ||
    dubPlaybackWorks ||
    audioType !== 'sub';

  const { data: dubProbeData } = useDubStreamProbe(
    selectedEpisode || '',
    servers,
    skipDubProbe
  );
  const dubProbeHasSources = (dubProbeData?.sources?.length ?? 0) > 0;
  const dubAvailable = useMemo(
    () =>
      serversHaveDub ||
      metadataIndicatesDub ||
      dubPlaybackWorks ||
      dubProbeHasSources,
    [serversHaveDub, metadataIndicatesDub, dubPlaybackWorks, dubProbeHasSources]
  );

  // Dynamic page title
  useDocumentTitle(anime?.title ? `${anime.title} — EP ${selectedEpisodeNum}` : 'Watch');

  // Initialize episode from URL or first episode (runs once on mount)
  useEffect(() => {
    if (!episodes?.length || selectedEpisode) return;

    const epParam = searchParams.get('ep');
    if (epParam) {
      const epNum = parseInt(epParam, 10);
      const ep = episodes.find(e => e.number === epNum);
      if (ep) {
        setSelectedEpisode(ep.id);
        setSelectedEpisodeNum(ep.number);
        return;
      }
    }
    // Default to first episode if no URL param
    setSelectedEpisode(episodes[0].id);
    setSelectedEpisodeNum(episodes[0].number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes]);



  // Auto-select server when servers load, episode changes, or sub/dub toggles.
  // Never leave selectedServer empty — that used to disable streaming and show stale video.
  useEffect(() => {
    if (!servers?.length) return;

    const matchingServers = servers.filter(s => s.type === audioType);
    if (matchingServers.length > 0) {
      setSelectedServer(matchingServers[0].name);
    } else if (!selectedServer || !servers.some(s => s.name === selectedServer)) {
      setSelectedServer(servers[0].name);
    }
  }, [servers, audioType, selectedEpisode]);

  // Auto-failover on stream error
  useEffect(() => {
    if (streamError && servers?.length && serverRetryCount < servers.length) {
      const currentIndex = servers.findIndex(s => s.name === selectedServer);
      const nextServer = servers[(currentIndex + 1) % servers.length];
      console.log(`[Watch] 🔄 Failover to server: ${nextServer.name} (attempt ${serverRetryCount + 1}/${servers.length})`);
      toast.info(`Switching to server ${nextServer.name}...`, {
        description: `Attempt ${serverRetryCount + 1} of ${servers.length}`,
        duration: 3000,
      });
      setSelectedServer(nextServer.name);
      setServerRetryCount(prev => prev + 1);
    }
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
      console.error('[Watch] ❌ Stream error:', streamError);
    }
  }, [streamError]);

  // Handle video player errors
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
      console.log('[Watch] ❌ All servers exhausted, stopping retries');
      return;
    }

    // Try next source URL (same server) first
    if (sourceRetryIndex + 1 < sources.length) {
      console.log(`[Watch] 🔄 Trying next source (index ${sourceRetryIndex + 1}/${sources.length - 1})`);
      setSourceRetryIndex(prev => prev + 1);
      return;
    }

    // If we've exhausted sources, fail over to next server
    if (servers?.length && serverRetryCount < servers.length) {
      const currentIndex = servers.findIndex(s => s.name === selectedServer);
      const nextServer = servers[(currentIndex + 1) % servers.length];
      console.log(`[Watch] 🔄 Player failover to server: ${nextServer.name} (attempt ${serverRetryCount + 1}/${servers.length})`);
      setSelectedServer(nextServer.name);
      setServerRetryCount(prev => prev + 1);
    }
  }, [selectedServer, selectedEpisode, serverRetryCount, servers, sourceRetryIndex, streamData]);

  // Reset retry count when episode or audio changes (new stream fetch)
  useEffect(() => {
    setServerRetryCount(0);
  }, [selectedEpisode, audioType]);

  // Reset source retries when stream changes
  useEffect(() => {
    setSourceRetryIndex(0);
  }, [streamData, selectedServer, audioType, quality]);

  // Get best quality source
  const getVideoSource = useCallback(() => {
    if (!streamData?.sources?.length) return null;

    const sources = streamData.sources;

    // If the current URL failed, rotate through available sources
    const fallbackSource = sources[sourceRetryIndex];
    if (fallbackSource) return fallbackSource;

    // Find matching quality or best available
    const qualityOrder: QualityType[] = ['1080p', '720p', '480p', '360p', 'auto'];
    const startIndex = qualityOrder.indexOf(quality);

    for (let i = startIndex; i < qualityOrder.length; i++) {
      const source = streamData.sources.find(s => s.quality === qualityOrder[i]);
      if (source) return source;
    }

    // Fallback to first available
    return streamData.sources[0];
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

    setSelectedEpisode(episodeId);
    setSelectedEpisodeNum(episodeNum);
    setSelectedServer(''); // Reset server for new episode
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

  // Prefer dub when episode is dub-only (metadata) or dub is confirmed via servers/stream probe
  useEffect(() => {
    if (!currentEpisode) return;
    if (audioManuallySet) return;
    const currentHasSub = currentEpisode.hasSub || !currentEpisode.hasDub;
    const currentHasDub =
      currentEpisode.hasDub ||
      (anime?.dubCount != null && currentEpisode.number <= anime.dubCount) ||
      serversHaveDub ||
      dubProbeHasSources;

    if (currentHasSub === false && currentHasDub) {
      setAudioType('dub');
    }
  }, [currentEpisode, audioManuallySet, anime?.dubCount, serversHaveDub, dubProbeHasSources]);

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
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <AlertCircle className="w-16 h-16 text-yellow-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">No Episodes Found</h2>
            <p className="text-muted-foreground mb-6 text-center max-w-md">
              We couldn't find any episodes for this anime. This might be because:
              <br /><br />
              • The anime is not yet released
              <br />
              • It's a new entry that hasn't been added to streaming sources
              <br />
              • The AniList entry needs to be linked to streaming sources
            </p>

            <div className="flex flex-col gap-4 w-full max-w-md">
              <Button
                onClick={() => navigate(`/browse?q=${encodeURIComponent(anime?.title || 'anime')}`)}
                variant="default"
                className="bg-fox-orange hover:bg-fox-orange/90"
              >
                <Play className="w-4 h-4 mr-2" />
                Search for "{anime?.title || 'anime'}"
              </Button>

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

  // Mobile: Normal scrollable page layout (not forced fullscreen)
  if (isMobile()) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />

        <main className="flex-1 relative z-10">
          {/* Video Player */}
          <div className="w-full bg-black" ref={playerRef}>
            <div className="relative aspect-video">
              {streamLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-fox-orange" />
                    <p className="text-white/80 text-sm">Loading stream...</p>
                  </div>
                </div>
              ) : videoSource ? (
                <VideoPlayer
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
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <div className="text-center p-6">
                    <AlertCircle className="w-10 h-10 text-yellow-500 mx-auto mb-3" />
                    <p className="text-white font-medium text-sm">No stream available</p>
                    <Button
                      size="sm"
                      className="mt-3 bg-fox-orange"
                      onClick={() => { setServerRetryCount(0); refetchStream(); }}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Retry
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Episode Nav + Title */}
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-white truncate">
                  EP {currentEpisode?.number || selectedEpisodeNum}
                  {currentEpisode?.title && currentEpisode.title !== `Episode ${currentEpisode.number}` && (
                    <span className="text-muted-foreground font-normal ml-1.5 text-sm">
                      — {currentEpisode.title}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{anime?.title}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevEpisode}
                  disabled={!hasPrev}
                  className="border-white/10 hover:bg-white/5 h-8 w-8 p-0 touch-manipulation"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextEpisode}
                  disabled={!hasNext}
                  className="border-white/10 hover:bg-white/5 h-8 w-8 p-0 touch-manipulation"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Streaming Controls */}
          <div className="px-4 pb-3">
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

          {/* About Section */}
          <div className="px-4 pb-4">
            <div className="rounded-xl border border-white/5 bg-card/30 p-4 backdrop-blur-md">
              <div className="flex gap-3">
                <img
                  src={anime?.image}
                  alt=""
                  className="h-28 w-20 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-sm font-bold text-white leading-tight">{anime?.title}</h3>
                  {anime?.titleJapanese && (
                    <p className="mt-0.5 text-xs italic text-muted-foreground truncate">{anime.titleJapanese}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {formatRating(anime?.rating) && (
                      <Badge variant="secondary" className="gap-1 border-yellow-500/20 bg-yellow-500/10 text-yellow-500 text-[10px] px-1.5 py-0">
                        <Star className="h-2.5 w-2.5 fill-current" />
                        {formatRating(anime?.rating)}
                      </Badge>
                    )}
                    <Badge variant="outline" className="border-white/10 text-[10px] px-1.5 py-0">{anime?.type}</Badge>
                    {anime?.status && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          anime.status === 'Ongoing'
                            ? 'border-green-500/50 bg-green-500/10 text-green-500'
                            : anime.status === 'Completed'
                              ? 'border-blue-500/50 bg-blue-500/10 text-blue-500'
                              : 'border-yellow-500/50 bg-yellow-500/10 text-yellow-500'
                        )}
                      >
                        {anime.status}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {(anime?.season || anime?.year != null) && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3 opacity-80" />
                        {[anime.season, anime.year].filter((v) => v != null && v !== '').join(' ')}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Tv className="h-3 w-3 opacity-80" />
                      {anime?.episodes || '?'} eps
                    </span>
                  </div>
                </div>
              </div>
              {plainDescription(anime?.description) && (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {plainDescription(anime?.description)}
                </p>
              )}
            </div>
          </div>

          {/* Episode List */}
          <div className="px-4 pb-6">
            <div className="rounded-xl border border-white/5 bg-card/30 backdrop-blur-md overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <h3 className="text-sm font-semibold text-white">
                  Episodes
                  <span className="text-white/40 font-normal ml-2 text-xs">{episodes?.length || 0}</span>
                </h3>
              </div>
              <div className="max-h-[50vh] overflow-y-auto p-2 space-y-1">
                {episodes?.map((ep) => {
                  const progress = getEpisodeProgress(ep.number);
                  return (
                    <button
                      key={ep.id}
                      onClick={() => handleEpisodeSelect(ep.id, ep.number)}
                      className={cn(
                        "w-full rounded-lg text-left transition-colors relative overflow-hidden touch-manipulation",
                        selectedEpisode === ep.id ? "bg-fox-orange text-white" : "bg-white/[0.03] text-white/80 active:bg-white/10"
                      )}
                    >
                      <div className="flex items-center gap-3 px-3 py-2.5 relative z-10">
                        <span className={cn(
                          "w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0",
                          selectedEpisode === ep.id ? "bg-white/20" : "bg-white/10"
                        )}>
                          {selectedEpisode === ep.id ? <Play className="w-3 h-3 fill-current" /> : ep.number}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{ep.title || `Episode ${ep.number}`}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {(ep.hasSub || !ep.hasDub) && <span className="text-[10px] text-white/50">SUB</span>}
                            {(ep.hasDub ||
                              (anime?.dubCount != null && ep.number <= anime.dubCount) ||
                              dubAvailable) && (
                              <span className="text-[10px] text-green-400/70">DUB</span>
                            )}
                            {progress > 0 && progress < 0.9 && (
                              <span className="text-[10px] text-fox-orange">{Math.round(progress * 100)}%</span>
                            )}
                            {progress >= 0.9 && (
                              <span className="text-[10px] text-green-400">Watched</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {progress > 0 && selectedEpisode !== ep.id && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
                          <div
                            className={cn("h-full rounded-full", progress >= 0.9 ? "bg-green-500" : "bg-fox-orange")}
                            style={{ width: `${Math.min(100, progress * 100)}%` }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </main>

        <Footer />
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
          />
        </div>
      )}

      <Navbar />

      <main className={cn(
        "flex-1 relative z-10 transition-all duration-500",
        isCinemaMode && "pt-[calc(56.25vw+2rem)] md:pt-[calc(56.25vw+3rem)] lg:pt-[calc(56.25vw+4rem)]"
      )}>
        <div className={cn(
          "max-w-[1800px] mx-auto px-4 pb-12 transition-all duration-500",
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
                <div className="absolute -inset-1 bg-gradient-to-r from-fox-orange/20 to-purple-600/20 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-1000"></div>
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
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
                  ) : videoSource ? (
                    <VideoPlayer
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
                        {streamError && (
                          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg w-full">
                            <p className="text-xs text-red-400 font-mono text-left truncate">
                              Error: {typeof streamError === 'object' ? JSON.stringify(streamError) : String(streamError)}
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
