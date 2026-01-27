import { useRef, useEffect, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipForward,
  Settings,
  Subtitles,
  AlertTriangle,
  RefreshCw,
  PictureInPicture,
  PictureInPicture2,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { VideoPreview } from './VideoPreview';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface VideoSubtitle {
  url: string;
  lang: string;
  label?: string;
}

interface VideoPlayerProps {
  src: string;
  isM3U8?: boolean;
  subtitles?: VideoSubtitle[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  onEnded?: () => void;
  onError?: (error: string) => void;
  poster?: string;
  onNextEpisode?: () => void;
  hasNextEpisode?: boolean;
}

// Logger for video player events
const playerLog = (level: 'info' | 'warn' | 'error', message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const prefix = `[VideoPlayer ${timestamp}]`;

  switch (level) {
    case 'info':
      console.log(`${prefix} ${message}`, data || '');
      break;
    case 'warn':
      console.warn(`${prefix} ⚠️ ${message}`, data || '');
      break;
    case 'error':
      console.error(`${prefix} ❌ ${message}`, data || '');
      break;
  }
};

export const VideoPlayer = ({
  src,
  isM3U8 = true,
  subtitles = [],
  intro,
  outro,
  onEnded,
  onError,
  poster,
  onNextEpisode,
  hasNextEpisode
}: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressContainerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);
  const [showNextEpisodeCountdown, setShowNextEpisodeCountdown] = useState(false);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState(10);
  const [selectedSubtitle, setSelectedSubtitle] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hlsStats, setHlsStats] = useState<{ level: number; bandwidth: number } | null>(null);
  const [availableLevels, setAvailableLevels] = useState<{ height: number; bitrate: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [subtitleEnabled, setSubtitleEnabled] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isPiPActive, setIsPiPActive] = useState(false);
  
  // Video preview states
  const [isProgressHovering, setIsProgressHovering] = useState(false);
  const [progressMouseX, setProgressMouseX] = useState(0);

  // Retry loading the stream
  const retryLoad = useCallback(() => {
    if (retryCountRef.current < maxRetries) {
      retryCountRef.current++;
      playerLog('info', `Retrying stream load (attempt ${retryCountRef.current}/${maxRetries})`);
      setError(null);
      setIsLoading(true);

      if (hlsRef.current) {
        hlsRef.current.startLoad();
      }
    } else {
      playerLog('error', 'Max retries reached');
      setError('Failed to load stream after multiple attempts. Try a different server.');
    }
  }, []);

  // Initialize HLS or native video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Reset state
    setIsLoading(true);
    setError(null);
    retryCountRef.current = 0;

    playerLog('info', 'Initializing video player', {
      src: src.substring(0, 100) + '...',
      isM3U8,
      hlsSupported: Hls.isSupported()
    });

    if (isM3U8 && Hls.isSupported()) {
      // Cleanup previous instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        startLevel: -1, // Auto quality initially
        abrEwmaDefaultEstimate: 5000000, // 5Mbps initial estimate for HD
        abrMaxWithRealBitrate: true,
        testBandwidth: true,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 1000,
        manifestLoadingRetryDelay: 1000,
        xhrSetup: (xhr) => {
          xhr.timeout = 30000;
        }
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      // Track quality levels
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        playerLog('info', 'Manifest parsed', {
          levels: data.levels.length,
          qualities: data.levels.map(l => `${l.height}p`)
        });

        // Store available levels
        setAvailableLevels(data.levels.map(l => ({ height: l.height, bitrate: l.bitrate })));

        // Set to highest quality by default
        const maxLevel = data.levels.length - 1;
        hls.currentLevel = maxLevel;
        setCurrentLevel(maxLevel);

        setIsLoading(false);
        video.play().catch((e) => {
          playerLog('warn', 'Autoplay blocked', e);
        });
      });

      // Track level switching
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const level = hls.levels[data.level];
        if (level) {
          playerLog('info', `Quality switched to ${level.height}p`);
          setHlsStats({ level: level.height, bandwidth: level.bitrate });
          setCurrentLevel(data.level);
        }
      });

      // Track fragment loading
      hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
        playerLog('info', `Fragment loaded`, {
          sn: data.frag.sn,
          duration: data.frag.duration?.toFixed(2) + 's',
          size: (data.frag.stats.total / 1024).toFixed(1) + 'KB'
        });
      });

      // Error handling with detailed logging
      hls.on(Hls.Events.ERROR, (_, data) => {
        playerLog('error', 'HLS error', {
          type: data.type,
          details: data.details,
          fatal: data.fatal,
          url: data.url?.substring(0, 100),
          response: data.response
        });

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR) {
                setError('Failed to load video manifest. The stream may be unavailable.');
                onError?.('manifest_load_error');
              } else if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR) {
                // Try to recover from fragment loading errors
                playerLog('warn', 'Fragment load error, attempting recovery');
                hls.startLoad();
              } else {
                setError('Network error. Check your connection and try again.');
                onError?.('network_error');
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              playerLog('warn', 'Media error, attempting recovery');
              hls.recoverMediaError();
              break;
            default:
              setError('An unexpected error occurred. Try a different server.');
              onError?.('unknown_error');
              hls.destroy();
              break;
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      playerLog('info', 'Using native HLS support');
      video.src = src;

      video.addEventListener('loadedmetadata', () => {
        playerLog('info', 'Video metadata loaded (native)');
        setIsLoading(false);
        video.play().catch(() => { });
      });

      video.addEventListener('error', () => {
        const err = video.error;
        playerLog('error', 'Native video error', {
          code: err?.code,
          message: err?.message
        });
        setError('Failed to load video. Try a different server.');
        onError?.('native_error');
      });
    } else {
      // Direct video source
      playerLog('info', 'Using direct video source');
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
      });
    }

    return () => {
      if (hlsRef.current) {
        playerLog('info', 'Destroying HLS instance');
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, isM3U8, onError]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);

      // Check for intro skip
      if (intro && video.currentTime >= intro.start && video.currentTime < intro.end) {
        setShowSkipIntro(true);
      } else {
        setShowSkipIntro(false);
      }

      // Check for outro skip
      if (outro && video.currentTime >= outro.start && video.currentTime < outro.end) {
        setShowSkipOutro(true);
      } else {
        setShowSkipOutro(false);
      }
    };
    const handleDurationChange = () => setDuration(video.duration);
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      // If video ended and there's a next episode, start countdown
      if (hasNextEpisode && !showNextEpisodeCountdown) {
        setShowNextEpisodeCountdown(true);
        setNextEpisodeCountdown(10);
      }
    };
    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, [intro, outro, onEnded, hasNextEpisode, showNextEpisodeCountdown]);

  // Fullscreen change handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Next episode countdown timer
  useEffect(() => {
    if (showNextEpisodeCountdown && nextEpisodeCountdown > 0) {
      const timer = setTimeout(() => {
        setNextEpisodeCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (showNextEpisodeCountdown && nextEpisodeCountdown === 0) {
      // Auto-play next episode
      onNextEpisode?.();
      setShowNextEpisodeCountdown(false);
      setNextEpisodeCountdown(10);
    }
  }, [showNextEpisodeCountdown, nextEpisodeCountdown, onNextEpisode]);

  // Picture-in-Picture handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnterPiP = () => setIsPiPActive(true);
    const handleLeavePiP = () => setIsPiPActive(false);

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, []);

  // Subtitle track handler
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = subtitleEnabled && selectedSubtitle === tracks[i].language ? 'showing' : 'hidden';
    }
  }, [selectedSubtitle, subtitleEnabled]);

  // Controls visibility
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  }, [isPlaying]);

  // Player controls
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const handleVolumeChange = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;

    const newVolume = value[0];
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, []);

  const handleSeek = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = value[0];
    setCurrentTime(value[0]);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }, []);

  const skipIntro = useCallback(() => {
    const video = videoRef.current;
    if (!video || !intro) return;
    video.currentTime = intro.end;
    setShowSkipIntro(false);
  }, [intro]);

  const skipOutro = useCallback(() => {
    const video = videoRef.current;
    if (!video || !outro) return;
    video.currentTime = outro.end;
    setShowSkipOutro(false);
  }, [outro]);

  const handleQualityChange = useCallback((level: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = level;
      setCurrentLevel(level);
    }
  }, []);

  const handlePlaybackSpeedChange = useCallback((speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
  }, []);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (error) {
      playerLog('error', 'Picture-in-Picture error', error);
    }
  }, []);

  const toggleSubtitles = useCallback(() => {
    setSubtitleEnabled(prev => !prev);
  }, []);

  const handleSubtitleSelect = useCallback((lang: string | null) => {
    setSelectedSubtitle(lang);
    setSubtitleEnabled(!!lang);
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'i':
          e.preventDefault();
          if (showSkipIntro) {
            skipIntro();
          }
          break;
        case 'arrowleft':
          e.preventDefault();
          if (videoRef.current) videoRef.current.currentTime -= 10;
          break;
        case 'arrowright':
          e.preventDefault();
          if (videoRef.current) videoRef.current.currentTime += 10;
          break;
        case 'arrowup':
          e.preventDefault();
          handleVolumeChange([Math.min(1, volume + 0.1)]);
          break;
        case 'arrowdown':
          e.preventDefault();
          handleVolumeChange([Math.max(0, volume - 0.1)]);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, toggleFullscreen, toggleMute, handleVolumeChange, volume, showSkipIntro, skipIntro]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black group"
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="w-full h-full"
        poster={poster}
        playsInline
        onClick={togglePlay}
        crossOrigin="anonymous"
      >
        {subtitles.map((sub, i) => (
          <track
            key={i}
            kind="subtitles"
            src={sub.url}
            srcLang={sub.lang}
            label={sub.label || sub.lang}
            default={selectedSubtitle === sub.lang}
          />
        ))}
      </video>

      {/* Loading spinner */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-fox-orange border-t-transparent rounded-full animate-spin" />
            <p className="text-white/80 text-sm">Loading stream...</p>
            {hlsStats && (
              <p className="text-white/60 text-xs">{hlsStats.level}p • {(hlsStats.bandwidth / 1000000).toFixed(1)} Mbps</p>
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90">
          <div className="flex flex-col items-center gap-4 text-center p-6 max-w-md">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <p className="font-semibold text-white text-lg">Playback Error</p>
              <p className="text-white/70 text-sm mt-2">{error}</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={retryLoad}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </Button>
            </div>
            <p className="text-white/40 text-xs mt-2">
              Tip: Try selecting a different server from the controls below
            </p>
          </div>
        </div>
      )}

      {/* Next Episode Countdown */}
      {showNextEpisodeCountdown && hasNextEpisode && (
        <div className="absolute bottom-24 right-4 bg-black/90 backdrop-blur-sm border border-white/20 rounded-lg p-4 animate-in slide-in-from-right z-20">
          <div className="flex flex-col items-center gap-2">
            <p className="text-white text-sm font-medium">Next Episode</p>
            <div className="w-12 h-12 rounded-full bg-fox-orange/20 flex items-center justify-center">
              <span className="text-fox-orange text-lg font-bold">{nextEpisodeCountdown}</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowNextEpisodeCountdown(false);
                  setNextEpisodeCountdown(10);
                }}
                className="border-white/20 hover:bg-white/10 text-white text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onNextEpisode?.();
                  setShowNextEpisodeCountdown(false);
                  setNextEpisodeCountdown(10);
                }}
                className="bg-fox-orange hover:bg-fox-orange/90 text-white text-xs"
              >
                Play Now
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Skip Intro Button */}
      {showSkipIntro && (
        <Button
          onClick={skipIntro}
          className="absolute bottom-24 right-4 bg-fox-orange hover:bg-fox-orange/90 text-white gap-2 animate-in slide-in-from-right z-20"
        >
          <SkipForward className="w-4 h-4" />
          Skip Intro
        </Button>
      )}

      {/* Skip Outro / Next Episode Button */}
      {showSkipOutro && (
        <Button
          onClick={skipOutro}
          className="absolute bottom-24 right-4 bg-fox-orange hover:bg-fox-orange/90 text-white gap-2 animate-in slide-in-from-right z-20"
        >
          <SkipForward className="w-4 h-4" />
          Skip Outro
        </Button>
      )}

      {/* Controls overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Center play button */}
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center"
        >
          {!isPlaying && !isLoading && (
            <div className="w-20 h-20 rounded-full bg-fox-orange/90 flex items-center justify-center hover:bg-fox-orange transition-colors">
              <Play className="w-10 h-10 text-white ml-1" fill="white" />
            </div>
          )}
        </button>

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
          {/* Progress bar */}
          <div 
            ref={progressContainerRef}
            className="relative group/progress"
            onMouseEnter={() => setIsProgressHovering(true)}
            onMouseLeave={() => setIsProgressHovering(false)}
            onMouseMove={(e) => setProgressMouseX(e.clientX)}
          >
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="absolute h-full bg-white/40"
                style={{ width: `${(buffered / duration) * 100}%` }}
              />
              <div
                className="absolute h-full bg-fox-orange"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="absolute bottom-0 left-0 right-0 opacity-0 group-hover/progress:opacity-100 transition-opacity cursor-pointer"
            />
            
            {/* Video Preview */}
            <VideoPreview
              videoSrc={src}
              currentTime={currentTime}
              duration={duration}
              isHovering={isProgressHovering}
              mouseX={progressMouseX}
              containerRef={progressContainerRef}
              poster={poster}
            />
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={togglePlay}
                className="text-white hover:bg-white/20"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </Button>

              <div className="flex items-center gap-2 group/volume">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="text-white hover:bg-white/20"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </Button>
                <div className="w-0 overflow-hidden group-hover/volume:w-20 transition-all duration-200">
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    max={1}
                    step={0.01}
                    onValueChange={handleVolumeChange}
                    className="w-20"
                  />
                </div>
              </div>

              <span className="text-white text-sm ml-2">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              {hlsStats && (
                <span className="text-white/60 text-xs ml-2 hidden sm:inline">
                  {hlsStats.level}p
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Subtitles */}
              {subtitles.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "text-white hover:bg-white/20",
                        subtitleEnabled && "text-fox-orange"
                      )}
                    >
                      <Subtitles className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleSubtitleSelect(null)}>
                      <span className="flex-1">Off</span>
                      {!selectedSubtitle && <Check className="w-4 h-4 ml-2" />}
                    </DropdownMenuItem>
                    {subtitles.map((sub, i) => (
                      <DropdownMenuItem
                        key={i}
                        onClick={() => handleSubtitleSelect(sub.lang)}
                      >
                        <span className="flex-1">{sub.label || sub.lang}</span>
                        {selectedSubtitle === sub.lang && <Check className="w-4 h-4 ml-2" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Picture-in-Picture */}
              {document.pictureInPictureEnabled && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={togglePiP}
                  className={cn(
                    "text-white hover:bg-white/20",
                    isPiPActive && "text-fox-orange"
                  )}
                >
                  {isPiPActive ? (
                    <PictureInPicture2 className="w-5 h-5" />
                  ) : (
                    <PictureInPicture className="w-5 h-5" />
                  )}
                </Button>
              )}

              {/* Settings */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                  >
                    <Settings className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {/* Quality Settings */}
                  {availableLevels.length > 0 && (
                    <>
                      <DropdownMenuLabel>Quality</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => handleQualityChange(-1)}>
                        <span className="flex-1">Auto</span>
                        {currentLevel === -1 && <Check className="w-4 h-4 ml-2" />}
                      </DropdownMenuItem>
                      {[...availableLevels].reverse().map((level, index) => {
                        const levelIndex = availableLevels.length - 1 - index;
                        return (
                          <DropdownMenuItem
                            key={levelIndex}
                            onClick={() => handleQualityChange(levelIndex)}
                          >
                            <span className="flex-1">{level.height}p</span>
                            {currentLevel === levelIndex && <Check className="w-4 h-4 ml-2" />}
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuSeparator />
                    </>
                  )}

                  {/* Playback Speed */}
                  <DropdownMenuLabel>Playback Speed</DropdownMenuLabel>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                    <DropdownMenuItem
                      key={speed}
                      onClick={() => handlePlaybackSpeedChange(speed)}
                    >
                      <span className="flex-1">{speed}x</span>
                      {playbackSpeed === speed && <Check className="w-4 h-4 ml-2" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Fullscreen */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                className="text-white hover:bg-white/20"
              >
                {isFullscreen ? (
                  <Minimize className="w-5 h-5" />
                ) : (
                  <Maximize className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
