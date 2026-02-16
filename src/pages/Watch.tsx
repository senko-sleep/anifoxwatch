import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { EpisodeList } from '../components/player/EpisodeList';
import { MobileEpisodeDrawer } from '../components/player/MobileEpisodeDrawer';
import { StreamingControls } from '../components/player/StreamingControls';
import { useAnime, useEpisodes, useStreamingLinks, useEpisodeServers } from '@/hooks/useAnime';
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
  MonitorPlay
} from 'lucide-react';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { toast } from 'sonner';

type AudioType = 'sub' | 'dub';
type QualityType = '1080p' | '720p' | '480p' | '360p' | 'auto';

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
  const [audioType, setAudioType] = useState<AudioType>('sub');
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

  // Data fetching
  const { data: anime, isLoading: animeLoading, error: animeError } = useAnime(cleanAnimeId || '', !!cleanAnimeId);
  const { data: episodes, isLoading: episodesLoading } = useEpisodes(cleanAnimeId || '', !!cleanAnimeId);
  const { data: servers, isLoading: serversLoading } = useEpisodeServers(selectedEpisode || '', !!selectedEpisode);
  const {
    data: streamData,
    isLoading: streamLoading,
    error: streamError,
    refetch: refetchStream
  } = useStreamingLinks(selectedEpisode || '', selectedServer || undefined, audioType, !!selectedEpisode);

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



  // Auto-switch to sub when dub is not available (only if user hasn't manually selected audio)
  useEffect(() => {
    if (!servers?.length) return;

    const hasDubServers = servers.some(s => s.type === 'dub');
    const hasSubServers = servers.some(s => s.type === 'sub');

    // If user wants dub but no dub servers available, switch to sub
    if (audioType === 'dub' && !hasDubServers && hasSubServers && !audioManuallySet) {
      console.log('[Watch] 🔄 No dub servers available, auto-switching to sub');
      setAudioType('sub');
    }
    // If user wants sub but no sub servers available, switch to dub
    if (audioType === 'sub' && !hasSubServers && hasDubServers && !audioManuallySet) {
      console.log('[Watch] 🔄 No sub servers available, auto-switching to dub');
      setAudioType('dub');
    }
  }, [servers, audioType, audioManuallySet]);

  // Auto-select best server when servers load or audio type changes
  useEffect(() => {
    if (servers?.length) {
      // Prefer servers matching audio type
      const matchingServers = servers.filter(s => s.type === audioType);
      if (matchingServers.length > 0) {
        setSelectedServer(matchingServers[0].name);
      } else if (!selectedServer) {
        setSelectedServer(servers[0].name);
      }
    }
  }, [servers, audioType]);

  // Reset server and retry count when audio type changes
  useEffect(() => {
    setSelectedServer('');
    setServerRetryCount(0);
    console.log(`[Watch] 🔊 Audio type changed to: ${audioType}`);
  }, [audioType, selectedEpisode]);

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

  // Reset retry count when episode changes
  useEffect(() => {
    setServerRetryCount(0);
  }, [selectedEpisode]);

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

  // Default audio behavior (Dub first; fall back to Sub if Dub isn't available)
  useEffect(() => {
    if (!currentEpisode) return;
    if (audioManuallySet) return;

    if (currentEpisode.hasDub) {
      setAudioType('dub');
    } else if (currentEpisode.hasSub) {
      setAudioType('sub');
    }
  }, [currentEpisode, audioManuallySet]);

  // Reset manual audio choice when switching episodes
  useEffect(() => {
    setAudioManuallySet(false);
  }, [selectedEpisode]);

  // Loading state
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

  // Handle case with no episodes
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

  // Error state
  if (animeError || !anime) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Anime Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The anime you're looking for doesn't exist or couldn't be loaded.
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

  const videoSource = getVideoSource();

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
        {/* Back button - Hidden in cinema mode */}

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
            "grid gap-8 transition-all duration-500",
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

              {/* Episode Navigation & Details - Compact in cinema mode */}
              <div className={cn(
                "grid md:grid-cols-[1fr_auto] gap-3 items-center bg-card/30 backdrop-blur-md border border-white/5 p-3 md:p-4 rounded-xl transition-all duration-500",
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
                    size="sm"
                    onClick={handlePrevEpisode}
                    disabled={!hasPrev}
                    className="gap-1 md:gap-2 border-white/10 hover:bg-white/5 h-9 md:h-10 px-3 md:px-4 touch-manipulation"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Prev</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextEpisode}
                    disabled={!hasNext}
                    className="gap-1 md:gap-2 border-white/10 hover:bg-white/5 h-9 md:h-10 px-3 md:px-4 touch-manipulation"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Streaming Controls - Centered in cinema mode */}
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
                  hasDub={currentEpisode?.hasDub || (anime?.dubCount != null && anime.dubCount > 0) || (episodes?.some(e => e.hasDub) ?? false)}
                  hasSub={currentEpisode?.hasSub !== false}
                />
              </div>

              {/* Mobile Episode Drawer - Only visible on mobile */}
              <div className="lg:hidden">
                <MobileEpisodeDrawer
                  episodes={episodes || []}
                  selectedEpisodeId={selectedEpisode}
                  onEpisodeSelect={handleEpisodeSelect}
                  isLoading={episodesLoading}
                  anime={anime}
                  currentEpisodeNum={selectedEpisodeNum}
                />
              </div>

              {/* Enhanced Anime Info Card - Centered in cinema mode */}
              <div className={cn(
                "p-4 md:p-6 bg-card/30 backdrop-blur-md border border-white/5 rounded-xl space-y-4 md:space-y-6 shadow-xl transition-all duration-500",
                isCinemaMode && "max-w-4xl mx-auto"
              )}>
                <div className="flex flex-col sm:flex-row gap-4 md:gap-6">
                  <div className="relative group mx-auto sm:mx-0">
                    <img
                      src={anime.image}
                      alt={anime.title}
                      className="w-24 h-36 sm:w-32 sm:h-48 object-cover rounded-lg shadow-xl ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-3 md:space-y-4 text-center sm:text-left">
                    <div>
                      <h1 className="text-xl md:text-2xl font-bold leading-tight bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">{anime.title}</h1>
                      {anime.titleJapanese && (
                        <p className="text-xs md:text-sm text-muted-foreground mt-1 italic">{anime.titleJapanese}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {formatRating(anime.rating) && (
                        <Badge variant="secondary" className="gap-1 bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                          <Star className="w-3 h-3 fill-current" />
                          {formatRating(anime.rating)}
                        </Badge>
                      )}
                      <Badge variant="outline" className="border-white/10">{anime.type}</Badge>
                      <Badge variant="outline" className={
                        anime.status === 'Ongoing' ? 'border-green-500/50 text-green-500 bg-green-500/10' :
                          anime.status === 'Completed' ? 'border-blue-500/50 text-blue-500 bg-blue-500/10' :
                            'border-yellow-500/50 text-yellow-500 bg-yellow-500/10'
                      }>
                        {anime.status}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                      {anime.year && (
                        <span className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {anime.year}
                        </span>
                      )}
                      {anime.duration && (
                        <span className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {anime.duration}
                        </span>
                      )}
                      <span className="flex items-center gap-2">
                        <Tv className="w-4 h-4" />
                        {anime.episodes || '?'} Episodes
                      </span>
                    </div>
                  </div>
                </div>

                {anime.genres?.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-4 border-t border-white/5">
                    {anime.genres.map(genre => (
                      <Badge key={genre} variant="secondary" className="text-xs bg-white/5 hover:bg-white/10 transition-colors hover:scale-105 transform">
                        {genre}
                      </Badge>
                    ))}
                  </div>
                )}

                {anime.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 hover:line-clamp-none transition-all duration-300">
                    {anime.description}
                  </p>
                )}
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
