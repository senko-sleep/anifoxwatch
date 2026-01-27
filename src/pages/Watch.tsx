import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { EpisodeList } from '../components/player/EpisodeList';
import { StreamingControls } from '../components/player/StreamingControls';
import { useAnime, useEpisodes, useStreamingLinks, useEpisodeServers } from '@/hooks/useAnime';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  RefreshCw
} from 'lucide-react';

type AudioType = 'sub' | 'dub';
type QualityType = '1080p' | '720p' | '480p' | '360p' | 'auto';

const Watch = () => {
  const { animeId } = useParams<{ animeId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

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

  // Refs
  const playerRef = useRef<HTMLDivElement>(null);

  // Data fetching
  const { data: anime, isLoading: animeLoading, error: animeError } = useAnime(animeId || '', !!animeId);
  const { data: episodes, isLoading: episodesLoading } = useEpisodes(animeId || '', !!animeId);
  const { data: servers, isLoading: serversLoading } = useEpisodeServers(selectedEpisode || '', !!selectedEpisode);
  const {
    data: streamData,
    isLoading: streamLoading,
    error: streamError,
    refetch: refetchStream
  } = useStreamingLinks(selectedEpisode || '', selectedServer || undefined, audioType, !!selectedEpisode);

  // Initialize episode from URL or first episode
  useEffect(() => {
    const epParam = searchParams.get('ep');
    if (epParam && episodes?.length) {
      const epNum = parseInt(epParam, 10);
      const ep = episodes.find(e => e.number === epNum);
      if (ep) {
        setSelectedEpisode(ep.id);
        setSelectedEpisodeNum(ep.number);
        return;
      }
    }
    // Default to first episode
    if (episodes?.length && !selectedEpisode) {
      setSelectedEpisode(episodes[0].id);
      setSelectedEpisodeNum(episodes[0].number);
    }
  }, [episodes, searchParams, selectedEpisode]);

  // Update URL when episode changes
  useEffect(() => {
    if (selectedEpisodeNum) {
      setSearchParams({ ep: String(selectedEpisodeNum) }, { replace: true });
    }
  }, [selectedEpisodeNum, setSearchParams]);

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
  }, [audioType]);

  // Auto-failover on stream error
  useEffect(() => {
    if (streamError && servers?.length && serverRetryCount < servers.length) {
      const currentIndex = servers.findIndex(s => s.name === selectedServer);
      const nextServer = servers[(currentIndex + 1) % servers.length];
      console.log(`[Watch] 🔄 Failover to server: ${nextServer.name} (attempt ${serverRetryCount + 1}/${servers.length})`);
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
    console.error('[Watch] 🎬 Player error:', error, {
      server: selectedServer,
      episode: selectedEpisode,
      retryCount: serverRetryCount
    });

    const sources = streamData?.sources || [];

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

  // Episode navigation
  const handleEpisodeSelect = useCallback((episodeId: string, episodeNum: number) => {
    setSelectedEpisode(episodeId);
    setSelectedEpisodeNum(episodeNum);
    setSelectedServer(''); // Reset server for new episode
    playerRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

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

      <main className="flex-1 relative z-10">
        {/* Back button */}

        <div className="max-w-[1800px] mx-auto px-4 pb-12 pt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/anime/${animeId}`)}
            className="text-muted-foreground hover:text-foreground hover:bg-white/10 mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Anime
          </Button>

          <div className="grid lg:grid-cols-12 gap-8">
            {/* Main Player Area */}
            <div className="lg:col-span-9 space-y-6" ref={playerRef}>
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
                          <p className="text-sm text-zinc-400">Scraping best quality sources</p>
                        </div>
                      </div>
                    </div>
                  ) : videoSource ? (
                    <VideoPlayer
                      src={videoSource.url}
                      isM3U8={videoSource.isM3U8}
                      subtitles={streamData?.subtitles}
                      intro={streamData?.intro}
                      outro={streamData?.outro}
                      onEnded={autoPlay && hasNext ? handleNextEpisode : undefined}
                      onError={handlePlayerError}
                      poster={anime.cover || anime.image}
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
              <div className="grid md:grid-cols-[1fr_auto] gap-4 items-center bg-card/30 backdrop-blur-md border border-white/5 p-4 rounded-xl">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold truncate">
                    Episode {currentEpisode?.number || selectedEpisodeNum}
                    {currentEpisode?.title && currentEpisode.title !== `Episode ${currentEpisode.number}` && (
                      <span className="text-muted-foreground font-normal ml-2 text-base">
                        - {currentEpisode.title}
                      </span>
                    )}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {anime.title}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevEpisode}
                    disabled={!hasPrev}
                    className="gap-2 border-white/10 hover:bg-white/5"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Prev
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextEpisode}
                    disabled={!hasNext}
                    className="gap-2 border-white/10 hover:bg-white/5"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Streaming Controls */}
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
                hasDub={currentEpisode?.hasDub}
              />

              {/* Anime Info Card */}
              <div className="p-6 bg-card/30 backdrop-blur-md border border-white/5 rounded-xl space-y-6">
                <div className="flex flex-col sm:flex-row gap-6">
                  <img
                    src={anime.image}
                    alt={anime.title}
                    className="w-32 h-48 object-cover rounded-lg shadow-xl ring-1 ring-white/10 self-start shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-4">
                    <div>
                      <h1 className="text-2xl font-bold leading-tight">{anime.title}</h1>
                      {anime.titleJapanese && (
                        <p className="text-sm text-muted-foreground mt-1">{anime.titleJapanese}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {anime.rating && (
                        <Badge variant="secondary" className="gap-1 bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                          <Star className="w-3 h-3 fill-current" />
                          {anime.rating.toFixed(1)}
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
                        {anime.episodes || '?'} Videos
                      </span>
                    </div>
                  </div>
                </div>

                {anime.genres?.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-4 border-t border-white/5">
                    {anime.genres.map(genre => (
                      <Badge key={genre} variant="secondary" className="text-xs bg-white/5 hover:bg-white/10 transition-colors">
                        {genre}
                      </Badge>
                    ))}
                  </div>
                )}

                {anime.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {anime.description}
                  </p>
                )}
              </div>
            </div>

            {/* Episode List Sidebar */}
            <div className="lg:col-span-3">
              <div className="bg-card/30 backdrop-blur-md border border-white/5 rounded-xl h-[800px] flex flex-col sticky top-24">
                <div className="p-4 border-b border-white/5">
                  <h3 className="font-bold flex items-center gap-2">
                    <Tv className="w-4 h-4 text-fox-orange" />
                    Episodes
                  </h3>
                </div>
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
