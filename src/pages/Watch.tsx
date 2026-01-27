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
  const [audioType, setAudioType] = useState<AudioType>('sub');
  const [quality, setQuality] = useState<QualityType>('auto');
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [autoPlay, setAutoPlay] = useState(true);
  const [serverRetryCount, setServerRetryCount] = useState(0);

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
  }, [selectedServer, selectedEpisode, serverRetryCount]);

  // Reset retry count when episode changes
  useEffect(() => {
    setServerRetryCount(0);
  }, [selectedEpisode]);

  // Get best quality source
  const getVideoSource = useCallback(() => {
    if (!streamData?.sources?.length) return null;

    // Find matching quality or best available
    const qualityOrder: QualityType[] = ['1080p', '720p', '480p', '360p', 'auto'];
    const startIndex = qualityOrder.indexOf(quality);

    for (let i = startIndex; i < qualityOrder.length; i++) {
      const source = streamData.sources.find(s => s.quality === qualityOrder[i]);
      if (source) return source;
    }

    // Fallback to first available
    return streamData.sources[0];
  }, [streamData, quality]);

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
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Back button */}
        <div className="container py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>

        <div className="max-w-[2000px] mx-auto px-4 pb-8">
          <div className="grid lg:grid-cols-12 gap-8">
            {/* Main Player Area */}
            <div className="lg:col-span-9 space-y-6" ref={playerRef}>
              {/* Video Player */}
              <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 group">
                {streamLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-fox-surface/50">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-12 h-12 animate-spin text-fox-orange" />
                      <p className="text-sm text-muted-foreground">Loading stream...</p>
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
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4 text-center p-6 max-w-md">
                      <AlertCircle className="w-12 h-12 text-yellow-500" />
                      <div>
                        <p className="font-medium">No stream available</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {serverRetryCount >= (servers?.length || 0) 
                            ? 'All servers failed. The episode may not be available right now.'
                            : 'Trying alternative sources...'}
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setServerRetryCount(0);
                            setSelectedServer('');
                            refetchStream();
                          }}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retry All
                        </Button>
                        {servers && servers.length > 1 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const currentIndex = servers.findIndex(s => s.name === selectedServer);
                              const nextServer = servers[(currentIndex + 1) % servers.length];
                              setSelectedServer(nextServer.name);
                            }}
                          >
                            Try Next Server
                          </Button>
                        )}
                      </div>
                      {streamError && (
                        <p className="text-xs text-red-400 mt-2">
                          Error: {typeof streamError === 'object' ? JSON.stringify(streamError) : String(streamError)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Episode Navigation */}
              <div className="flex items-center justify-between gap-4 p-4 bg-fox-surface/30 rounded-xl">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevEpisode}
                  disabled={!hasPrev}
                  className="gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>

                <div className="flex-1 text-center">
                  <p className="font-medium">
                    Episode {currentEpisode?.number || selectedEpisodeNum}
                  </p>
                  {currentEpisode?.title && currentEpisode.title !== `Episode ${currentEpisode.number}` && (
                    <p className="text-sm text-muted-foreground truncate">
                      {currentEpisode.title}
                    </p>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextEpisode}
                  disabled={!hasNext}
                  className="gap-2"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {/* Streaming Controls */}
              <StreamingControls
                audioType={audioType}
                onAudioTypeChange={setAudioType}
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

              {/* Anime Info */}
              <div className="p-6 bg-fox-surface/30 rounded-xl space-y-4">
                <div className="flex gap-4">
                  <img
                    src={anime.image}
                    alt={anime.title}
                    className="w-24 h-36 object-cover rounded-lg shadow-lg flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-bold line-clamp-2">{anime.title}</h1>
                    {anime.titleJapanese && (
                      <p className="text-sm text-muted-foreground mt-1">{anime.titleJapanese}</p>
                    )}

                    <div className="flex flex-wrap gap-2 mt-3">
                      {anime.rating && (
                        <Badge variant="secondary" className="gap-1">
                          <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                          {anime.rating.toFixed(1)}
                        </Badge>
                      )}
                      <Badge variant="outline">{anime.type}</Badge>
                      <Badge variant="outline" className={
                        anime.status === 'Ongoing' ? 'border-green-500 text-green-500' :
                          anime.status === 'Completed' ? 'border-blue-500 text-blue-500' :
                            'border-yellow-500 text-yellow-500'
                      }>
                        {anime.status}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                      {anime.year && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {anime.year}
                        </span>
                      )}
                      {anime.duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {anime.duration}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Tv className="w-4 h-4" />
                        {anime.episodes || '?'} eps
                      </span>
                    </div>
                  </div>
                </div>

                {anime.genres?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {anime.genres.map(genre => (
                      <Badge key={genre} variant="secondary" className="text-xs">
                        {genre}
                      </Badge>
                    ))}
                  </div>
                )}

                {anime.description && (
                  <p className="text-sm text-muted-foreground line-clamp-4">
                    {anime.description}
                  </p>
                )}
              </div>
            </div>

            {/* Episode List Sidebar */}
            <div className="lg:col-span-3">
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
      </main>

      <Footer />
    </div>
  );
};

export default Watch;
