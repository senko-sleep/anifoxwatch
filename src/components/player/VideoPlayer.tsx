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
  Check,
  ChevronsLeft,
  ChevronsRight,
  Lock,
  Unlock,
  Volume1,
  Sun,
  RotateCw
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
import { PostProxyLoader } from '@/lib/hls-post-loader';

interface VideoSubtitle {
  url: string;
  lang: string;
  label?: string;
}

interface VideoPlayerProps {
  src: string;
  isM3U8?: boolean;
  subtitles?: Array<{ lang: string; label?: string; url: string }>;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  onEnded?: () => void;
  onError?: (error: string) => void;
  poster?: string;
  onNextEpisode?: () => void;
  hasNextEpisode?: boolean;
  animeId?: string;
  selectedEpisodeNum?: number;
  animeTitle?: string;
  animeImage?: string;
  animeSeason?: string;
  onBack?: () => void;
  onEpisodes?: () => void;
  onShowSettings?: () => void;
  autoFullscreen?: boolean;
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
  hasNextEpisode,
  animeId,
  selectedEpisodeNum,
  animeTitle,
  animeImage,
  animeSeason,
  onBack,
  onEpisodes,
  onShowSettings,
  autoFullscreen = false
}: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressContainerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track if we've already fired an error for the current source to prevent infinite loops
  const errorFiredRef = useRef(false);
  const lastErrorTimeRef = useRef(0);

  // Background MP4 cache for offline playback (non-M3U8 streams like WatchHentai)
  const bgDownloadControllerRef = useRef<AbortController | null>(null);
  const cachedBlobUrlRef = useRef<string | null>(null);

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

  // Position persistence state
  const [savedPosition, setSavedPosition] = useState(0);
  const [showPositionRestored, setShowPositionRestored] = useState(false);

  // Video preview states
  const [isProgressHovering, setIsProgressHovering] = useState(false);
  const [progressMouseX, setProgressMouseX] = useState(0);
  const [isProgressTouching, setIsProgressTouching] = useState(false);
  const [progressTouchX, setProgressTouchX] = useState(0);

  // Double tap seek states
  const [showSeekForwardOverlay, setShowSeekForwardOverlay] = useState(false);
  const [showSeekBackwardOverlay, setShowSeekBackwardOverlay] = useState(false);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);

  // Swipe gesture states
  const [isControlsLocked, setIsControlsLocked] = useState(false);
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);
  const [touchCurrentPos, setTouchCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeType, setSwipeType] = useState<'seek' | 'volume' | null>(null);
  const [swipeValue, setSwipeValue] = useState<number>(0);
  const swipeStartValueRef = useRef<number>(0);
  const [showSwipeOverlay, setShowSwipeOverlay] = useState(false);

  // Mobile settings panel state
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [mobileSettingsTab, setMobileSettingsTab] = useState<'quality' | 'speed' | 'subtitles'>('quality');

  // Auto-fullscreen on mobile: trigger once per mount when autoFullscreen prop is true
  const autoFullscreenFiredRef = useRef(false);

  // Helper to detect mobile device
  const isMobile = useCallback(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }, []);

  // Position persistence functions
  const getPositionKey = useCallback(() => {
    return `video-position-${animeId || 'unknown'}-${selectedEpisodeNum || 'unknown'}`;
  }, [animeId, selectedEpisodeNum]);

  const savePosition = useCallback((time: number) => {
    const key = getPositionKey();
    localStorage.setItem(key, time.toString());
    setSavedPosition(time);
  }, [getPositionKey]);

  const loadSavedPosition = useCallback(() => {
    const key = getPositionKey();
    const saved = localStorage.getItem(key);
    if (saved) {
      const position = parseFloat(saved);
      setSavedPosition(position);
      return position;
    }
    return 0;
  }, [getPositionKey]);

  const clearSavedPosition = useCallback(() => {
    const key = getPositionKey();
    localStorage.removeItem(key);
    setSavedPosition(0);
  }, [getPositionKey]);

  // Retry loading the stream
  const retryLoad = useCallback(() => {
    if (retryCountRef.current < maxRetries) {
      retryCountRef.current++;
      playerLog('info', `Retrying stream load (${retryCountRef.current}/${maxRetries})`);
      setError(null);
      setIsLoading(true);

      if (hlsRef.current) {
        hlsRef.current.recoverMediaError();
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
    errorFiredRef.current = false;

    playerLog('info', 'Initializing video player', {
      src: src.substring(0, 100) + '...',
      isM3U8,
      hlsSupported: Hls.isSupported()
    });

    if (isM3U8 && Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 60,
        maxMaxBufferLength: 600,
        maxBufferHole: 0.5,
        startLevel: -1,
        abrEwmaDefaultEstimate: 10000000,
        abrEwmaFastLive: 3,
        abrEwmaSlowLive: 9,
        abrEwmaFastVoD: 3,
        abrEwmaSlowVoD: 9,
        abrMaxWithRealBitrate: true,
        testBandwidth: true,
        startFragPrefetch: true,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 500,
        manifestLoadingRetryDelay: 500,
        nudgeOffset: 0.2,
        nudgeMaxRetry: 5,
        loader: PostProxyLoader,
        xhrSetup: (xhr) => {
          xhr.timeout = 30000;
        }
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        playerLog('info', 'Manifest parsed', {
          levels: data.levels.length,
          qualities: data.levels.map(l => `${l.height}p`)
        });

        setAvailableLevels(data.levels.map(l => ({ height: l.height, bitrate: l.bitrate })));

        const maxLevel = data.levels.length - 1;
        hls.currentLevel = maxLevel;
        setCurrentLevel(maxLevel);

        setIsLoading(false);
        video.play().catch((e) => {
          playerLog('warn', 'Autoplay blocked', e);
        });

        const savedPos = loadSavedPosition();
        if (savedPos > 5) {
          video.currentTime = savedPos;
          setCurrentTime(savedPos);
          setShowPositionRestored(true);
          playerLog('info', `Restored saved position: ${savedPos.toFixed(2)}s`);
          setTimeout(() => setShowPositionRestored(false), 3000);
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const level = hls.levels[data.level];
        if (level) {
          playerLog('info', `Quality switched to ${level.height}p`);
          setHlsStats({ level: level.height, bandwidth: level.bitrate });
          setCurrentLevel(data.level);
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
        playerLog('info', `Fragment loaded`, {
          sn: data.frag.sn,
          duration: data.frag.duration?.toFixed(2) + 's',
          size: (data.frag.stats.total / 1024).toFixed(1) + 'KB'
        });
      });

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
                playerLog('warn', 'Fragment load error, attempting recovery');
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
      playerLog('info', 'Using native HLS support');
      video.src = src;

      video.addEventListener('loadedmetadata', () => {
        playerLog('info', 'Video metadata loaded (native)');
        setIsLoading(false);

        const savedPos = loadSavedPosition();
        if (savedPos > 5) {
          video.currentTime = savedPos;
          setCurrentTime(savedPos);
          setShowPositionRestored(true);
          setTimeout(() => setShowPositionRestored(false), 3000);
        }

        video.play().catch(() => { });
      });

      video.addEventListener('error', () => {
        const now = Date.now();
        if (errorFiredRef.current && (now - lastErrorTimeRef.current) < 1000) {
          return;
        }

        errorFiredRef.current = true;
        lastErrorTimeRef.current = now;

        const err = video.error;
        playerLog('error', 'Native video error', {
          code: err?.code,
          message: err?.message
        });
        setError('Failed to load video. Try a different server.');
        onError?.('native_error');
      });
    } else {
      playerLog('info', 'Using direct video source');
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);

        const savedPos = loadSavedPosition();
        if (savedPos > 5) {
          video.currentTime = savedPos;
          setCurrentTime(savedPos);
          setShowPositionRestored(true);
          setTimeout(() => setShowPositionRestored(false), 3000);
        }

        video.play().catch(() => { });
      });
    }

    return () => {
      if (hlsRef.current) {
        playerLog('info', 'Destroying HLS instance');
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, isM3U8, onError, loadSavedPosition]);

  // Background MP4 cache
  useEffect(() => {
    if (isM3U8 || !src) return;

    if (cachedBlobUrlRef.current) {
      URL.revokeObjectURL(cachedBlobUrlRef.current);
      cachedBlobUrlRef.current = null;
    }
    if (bgDownloadControllerRef.current) {
      bgDownloadControllerRef.current.abort();
    }

    const controller = new AbortController();
    bgDownloadControllerRef.current = controller;
    const video = videoRef.current;
    if (!video) return;

    const doBgDownload = async () => {
      try {
        const resp = await fetch(src, { signal: controller.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const blob = await resp.blob();
        if (controller.signal.aborted) return;

        const blobUrl = URL.createObjectURL(blob);
        cachedBlobUrlRef.current = blobUrl;

        playerLog('info', `Background cache complete: ${(blob.size / 1024 / 1024).toFixed(1)}MB — switching to offline blob`);

        const vid = videoRef.current;
        if (!vid) return;

        const pos = vid.currentTime;
        const playing = !vid.paused;
        const vol = vid.volume;
        const muted = vid.muted;
        const rate = vid.playbackRate;

        const onReady = () => {
          vid.currentTime = pos;
          vid.volume = vol;
          vid.muted = muted;
          vid.playbackRate = rate;
          if (playing) vid.play().catch(() => {});
          vid.removeEventListener('loadeddata', onReady);
          playerLog('info', `Swapped to offline blob at ${pos.toFixed(1)}s`);
        };

        vid.addEventListener('loadeddata', onReady);
        vid.src = blobUrl;
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          playerLog('warn', 'Background MP4 cache failed, continuing with stream', e.message);
        }
      }
    };

    let delayTimer: ReturnType<typeof setTimeout> | null = null;

    const startAfterDelay = () => {
      playerLog('info', 'Video playing — will start background cache in 3s');
      delayTimer = setTimeout(() => {
        if (!controller.signal.aborted) doBgDownload();
      }, 3000);
    };

    if (!video.paused && video.currentTime > 0) {
      startAfterDelay();
    } else {
      video.addEventListener('playing', startAfterDelay, { once: true });
    }

    return () => {
      controller.abort();
      if (delayTimer) clearTimeout(delayTimer);
      video.removeEventListener('playing', startAfterDelay);
      if (cachedBlobUrlRef.current) {
        URL.revokeObjectURL(cachedBlobUrlRef.current);
        cachedBlobUrlRef.current = null;
      }
    };
  }, [src, isM3U8]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
      
      // Auto-fullscreen on mobile: only trigger once per mount when prop is true
      if (autoFullscreen && isMobile() && !autoFullscreenFiredRef.current) {
        autoFullscreenFiredRef.current = true;
        
        // Try webkitEnterFullscreen first (iOS Safari), then fallback to container fullscreen
        if ((video as any).webkitEnterFullscreen) {
          try {
            (video as any).webkitEnterFullscreen();
          } catch (e) {
            playerLog('warn', 'Auto-fullscreen webkitEnterFullscreen failed', e);
            tryEnterContainerFullscreen();
          }
        } else {
          tryEnterContainerFullscreen();
        }
      }
    };
    
    const tryEnterContainerFullscreen = async () => {
      const container = containerRef.current;
      if (container?.requestFullscreen) {
        try {
          await container.requestFullscreen();
          if (screen.orientation && (screen.orientation as any).lock) {
            try {
              await (screen.orientation as any).lock('landscape');
            } catch (e) {
              playerLog('warn', 'Auto-fullscreen orientation lock failed', e);
            }
          }
        } catch (e) {
          playerLog('warn', 'Auto-fullscreen container request failed', e);
        }
      }
    };
    const handlePause = () => {
      setIsPlaying(false);
      if (video.currentTime > 5 && video.duration - video.currentTime > 10) {
        savePosition(video.currentTime);
      }
    };

    const handleTimeUpdate = () => {
      const time = video.currentTime;
      setCurrentTime(time);

      if (Math.floor(time) % 2 === 0 && time > 5 && video.duration - time > 10) {
        savePosition(time);

        if (animeId && animeTitle && animeImage && selectedEpisodeNum) {
          let frameThumbnail: string | undefined;
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 180;
            const ctx = canvas.getContext('2d');
            if (ctx && video.videoWidth > 0) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              frameThumbnail = canvas.toDataURL('image/jpeg', 0.7);
            }
          } catch (e) {
            // Frame capture may fail due to CORS, ignore
          }

          import('@/lib/watch-history').then(({ WatchHistory }) => {
            WatchHistory.save(
              { id: animeId, title: animeTitle, image: animeImage, season: animeSeason } as any,
              selectedEpisodeNum.toString(),
              selectedEpisodeNum,
              time,
              video.duration,
              frameThumbnail
            );
          });
        }
      }

      if (intro && video.currentTime >= intro.start && video.currentTime < intro.end) {
        setShowSkipIntro(true);
      } else {
        setShowSkipIntro(false);
      }

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
      clearSavedPosition();

      if (hasNextEpisode) {
        setShowNextEpisodeCountdown(prev => {
          if (!prev) {
            setNextEpisodeCountdown(10);
            return true;
          }
          return prev;
        });
      }
    };
    const handleWaiting = () => {
      if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = setTimeout(() => setIsLoading(true), 400);
    };
    const handleCanPlay = () => {
      if (waitingTimerRef.current) {
        clearTimeout(waitingTimerRef.current);
        waitingTimerRef.current = null;
      }
      setIsLoading(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && video.currentTime > 5) {
        savePosition(video.currentTime);
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intro, outro, onEnded, hasNextEpisode, showNextEpisodeCountdown, savePosition, clearSavedPosition, animeId, selectedEpisodeNum, animeTitle, animeImage, autoFullscreen, isMobile]);

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
      setShowNextEpisodeCountdown(false);
      setNextEpisodeCountdown(10);
      onNextEpisode?.();
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

  // Controls visibility — show controls temporarily then auto-hide
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    // 3s on mobile (gives time to tap buttons), 1.5s on desktop
    const hideDelay = isMobile() ? 3000 : 1500;
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, hideDelay);
  }, [isPlaying, isMobile]);

  // Mobile: tap the video surface to toggle controls visibility
  const toggleControlsVisibility = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    setShowControls(prev => {
      const next = !prev;
      // Auto-hide after 3s if we just showed them and video is playing
      if (next && isPlaying) {
        controlsTimeoutRef.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }
      return next;
    });
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

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    if (document.fullscreenElement || (video as any).webkitDisplayingFullscreen) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((video as any).webkitExitFullscreen) {
        (video as any).webkitExitFullscreen();
      }
      if (isMobile() && screen.orientation && (screen.orientation as any).unlock) {
        try {
          (screen.orientation as any).unlock();
        } catch (e) {
          playerLog('warn', 'Orientation unlock failed', e);
        }
      }
    } else {
      if (isMobile() && screen.orientation && (screen.orientation as any).lock) {
        try {
          await (screen.orientation as any).lock('landscape');
        } catch (e) {
          playerLog('warn', 'Orientation lock failed', e);
        }
      }

      if (isMobile() && (video as any).webkitEnterFullscreen) {
        try {
          (video as any).webkitEnterFullscreen();
          return;
        } catch (e) {
          playerLog('warn', 'webkitEnterFullscreen failed, falling back to container fullscreen', e);
        }
      }

      if (container.requestFullscreen) {
        await container.requestFullscreen();
      }
    }
  }, [isMobile]);

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

  // ─── TOUCH HANDLERS ────────────────────────────────────────────────────────

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Don't intercept taps on buttons, sliders, or any interactive element.
    // This prevents button taps from also toggling controls or pausing the video.
    const target = e.target as HTMLElement;
    if (target.closest('button, input, [role="slider"], select, a, [data-radix-slider-thumb]')) {
      return;
    }

    const now = Date.now();
    const touch = e.touches[0];
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const width = rect.width;

    setTouchStartPos({ x: touch.clientX, y: touch.clientY });
    setTouchCurrentPos({ x: touch.clientX, y: touch.clientY });

    if (lastTapRef.current) {
      const timeDiff = now - lastTapRef.current.time;
      const xDiff = Math.abs(x - lastTapRef.current.x);
      const yDiff = Math.abs(y - lastTapRef.current.y);

      // Double tap detected (within 300ms and close proximity)
      if (timeDiff < 300 && xDiff < 80 && yDiff < 80) {
        if (x < width * 0.4) {
          e.preventDefault();
          e.stopPropagation();
          if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
          }
          setShowSeekBackwardOverlay(true);
          setTimeout(() => setShowSeekBackwardOverlay(false), 800);
          lastTapRef.current = null;
          return;
        } else if (x > width * 0.6) {
          e.preventDefault();
          e.stopPropagation();
          if (videoRef.current) {
            videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 10);
          }
          setShowSeekForwardOverlay(true);
          setTimeout(() => setShowSeekForwardOverlay(false), 800);
          lastTapRef.current = null;
          return;
        }
      }
    }

    lastTapRef.current = { time: now, x, y };

    // Mobile: tap video surface toggles controls; Desktop: show temporarily
    if (isMobile()) {
      toggleControlsVisibility();
    } else {
      showControlsTemporarily();
    }
  }, [showControlsTemporarily, toggleControlsVisibility, isMobile]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartPos || !containerRef.current || !videoRef.current) return;

    const touch = e.touches[0];
    setTouchCurrentPos({ x: touch.clientX, y: touch.clientY });

    const dx = touch.clientX - touchStartPos.x;
    const dy = touch.clientY - touchStartPos.y;

    if (!isSwiping) {
      if (Math.abs(dx) > 60) {
        setIsSwiping(true);
        setSwipeType('seek');
        swipeStartValueRef.current = videoRef.current.currentTime;
        setShowSwipeOverlay(true);
        setShowControls(false);
      } else if (Math.abs(dy) > 60) {
        const rect = containerRef.current.getBoundingClientRect();
        const startXRel = touchStartPos.x - rect.left;
        if (startXRel > rect.width * 0.5) {
          setIsSwiping(true);
          setSwipeType('volume');
          swipeStartValueRef.current = volume;
          setShowSwipeOverlay(true);
          setShowControls(false);
        }
      }
      return;
    }

    if (swipeType === 'seek') {
      const rect = containerRef.current.getBoundingClientRect();
      const seekDelta = (dx / rect.width) * (duration || 300);
      const newTime = Math.max(0, Math.min(duration, swipeStartValueRef.current + seekDelta));
      setSwipeValue(newTime);
      videoRef.current.currentTime = newTime;
    } else if (swipeType === 'volume') {
      const rect = containerRef.current.getBoundingClientRect();
      const volumeDelta = -(dy / (rect.height * 0.5));
      const newVolume = Math.max(0, Math.min(1, swipeStartValueRef.current + volumeDelta));
      videoRef.current.volume = newVolume;
      setVolume(newVolume);
      setSwipeValue(newVolume);
    }
  }, [isSwiping, swipeType, touchStartPos, duration, volume]);

  const handleTouchEnd = useCallback(() => {
    if (isSwiping) {
      setIsSwiping(false);
      setSwipeType(null);
      setTimeout(() => setShowSwipeOverlay(false), 500);
    }
    setTouchStartPos(null);
    setTouchCurrentPos(null);
  }, [isSwiping]);

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
      className={cn(
        "relative w-full h-full bg-black group overflow-hidden touch-none"
      )}
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Swipe Overlay */}
      {showSwipeOverlay && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="bg-black/60 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 flex flex-col items-center gap-2 animate-in fade-in zoom-in duration-200">
            {swipeType === 'seek' ? (
              <>
                <div className="flex items-center gap-3">
                  <RotateCw className={cn("w-8 h-8 text-fox-orange", (touchCurrentPos?.x || 0) < (touchStartPos?.x || 0) && "rotate-180")} />
                  <span className="text-3xl font-bold text-white">{formatTime(swipeValue)}</span>
                </div>
                <span className="text-white/60 text-sm">Release to Seek</span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  {swipeValue === 0 ? <VolumeX className="w-8 h-8 text-red-500" /> : <Volume2 className="w-8 h-8 text-fox-orange" />}
                  <span className="text-3xl font-bold text-white">{Math.round(swipeValue * 100)}%</span>
                </div>
                <span className="text-white/60 text-sm">Volume</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Double Tap Seek Overlays */}
      <div className="absolute inset-0 pointer-events-none z-10 flex">
        <div className={cn(
          "flex-1 flex flex-col items-center justify-center bg-white/5 backdrop-blur-sm transition-opacity duration-300",
          showSeekBackwardOverlay ? "opacity-100" : "opacity-0"
        )}>
          <ChevronsLeft className="w-12 h-12 text-white animate-pulse" />
          <span className="text-white font-bold mt-2">-10s</span>
        </div>
        <div className="flex-none w-1/3" />
        <div className={cn(
          "flex-1 flex flex-col items-center justify-center bg-white/5 backdrop-blur-sm transition-opacity duration-300",
          showSeekForwardOverlay ? "opacity-100" : "opacity-0"
        )}>
          <ChevronsRight className="w-12 h-12 text-white animate-pulse" />
          <span className="text-white font-bold mt-2">+10s</span>
        </div>
      </div>

      {/* Video element — no onClick on mobile to prevent accidental pauses */}
      <video
        ref={videoRef}
        className="w-full h-full"
        poster={poster}
        preload="auto"
        playsInline
        onClick={isMobile() ? undefined : togglePlay}
        crossOrigin="anonymous"
      >
        {subtitles.map((sub, i) => (
          <track
            key={i}
            kind="subtitles"
            src={sub.url}
            srcLang={sub.lang}
            label={sub.label || sub.lang}
            default={i === 0}
          />
        ))}
      </video>

      {/* Position Restored Notification */}
      {showPositionRestored && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-500/90 text-white px-4 py-2 rounded-lg backdrop-blur-sm z-20 animate-in slide-in-from-top fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">Position Restored: {formatTime(savedPosition)}</span>
          </div>
        </div>
      )}

      {/* Loading spinner */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-200">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-fox-orange/30 border-t-fox-orange rounded-full animate-spin"></div>
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
        {/* Top bar controls (Mobile only) */}
        {isMobile() && (
          <div className="absolute top-2 left-2 right-2 flex items-start justify-between z-30 pointer-events-none">
            <div className="flex items-center gap-1.5 pointer-events-auto">
              {onBack && (
                <button
                  onClick={(e) => { e.stopPropagation(); onBack(); }}
                  className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
                >
                  <ChevronsLeft className="w-4 h-4 text-white" />
                </button>
              )}
              <div className="px-2 py-1 bg-black/50 backdrop-blur-sm rounded-md max-w-[160px]">
                <p className="text-white text-[10px] font-medium truncate">
                  {animeTitle} - EP {selectedEpisodeNum}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 pointer-events-auto">
              {onEpisodes && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEpisodes(); }}
                  className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm flex items-center gap-1 active:scale-90 transition-transform"
                >
                  <RotateCw className="w-3 h-3 text-white" />
                  <span className="text-white text-[10px] font-medium">Episodes</span>
                </button>
              )}
              {onShowSettings && (
                <button
                  onClick={(e) => { e.stopPropagation(); onShowSettings(); }}
                  className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Settings className="w-3.5 h-3.5 text-white" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Center play button — only visible when paused */}
        {!isPlaying && !isLoading && (
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-fox-orange/90 flex items-center justify-center hover:bg-fox-orange transition-colors z-10"
          >
            <Play className="w-8 h-8 text-white ml-0.5" fill="white" />
          </button>
        )}

        {/* Bottom controls — stopPropagation on touch so taps here never reach the video */}
          <div
            className="absolute bottom-0 left-0 right-0 p-4 space-y-2"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {/* Progress bar — Netflix / YouTube premium style */}
            <div
              ref={progressContainerRef}
              className="relative group/progress cursor-pointer py-2"
              onMouseEnter={() => setIsProgressHovering(true)}
              onMouseLeave={() => setIsProgressHovering(false)}
              onMouseMove={(e) => setProgressMouseX(e.clientX)}
              onClick={(e) => {
                const rect = progressContainerRef.current?.getBoundingClientRect();
                if (rect) {
                  const x = e.clientX - rect.left;
                  const percentage = x / rect.width;
                  const time = percentage * (duration || 0);
                  handleSeek([time]);
                }
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                if (e.touches[0]) {
                  setIsProgressTouching(true);
                  setProgressTouchX(e.touches[0].clientX);
                }
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
                if (e.touches[0]) {
                  setProgressTouchX(e.touches[0].clientX);
                }
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                setTimeout(() => setIsProgressTouching(false), 300);
              }}
            >
              {/* Track container — grows on hover like Netflix */}
              <div className={cn(
                "relative w-full rounded-full overflow-hidden transition-all duration-200 ease-out",
                isMobile()
                  ? "h-[5px]"
                  : "h-[3px] group-hover/progress:h-[6px]"
              )}>
                {/* Background track */}
                <div className="absolute inset-0 bg-white/20" />
                {/* Buffered */}
                <div
                  className="absolute inset-y-0 left-0 bg-white/30 transition-[width] duration-300"
                  style={{ width: `${duration > 0 ? (buffered / duration) * 100 : 0}%` }}
                />
                {/* Played — with glow on hover */}
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 bg-fox-orange transition-shadow duration-200",
                    (isProgressHovering || isProgressTouching) && "shadow-[0_0_8px_rgba(255,120,30,0.6)]"
                  )}
                  style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />
                {/* Hover position indicator line */}
                {(isProgressHovering || isProgressTouching) && progressContainerRef.current && (() => {
                  const rect = progressContainerRef.current!.getBoundingClientRect();
                  const mx = (isProgressTouching ? progressTouchX : progressMouseX) - rect.left;
                  const pct = Math.max(0, Math.min(100, (mx / rect.width) * 100));
                  return (
                    <div
                      className="absolute inset-y-0 w-[2px] bg-white/60 pointer-events-none z-10"
                      style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
                    />
                  );
                })()}
              </div>

              {/* Scrub dot — appears on hover at playback position */}
              <div
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 rounded-full bg-fox-orange border-2 border-white transition-all duration-200 pointer-events-none z-20",
                  (isProgressHovering || isProgressTouching)
                    ? "w-[14px] h-[14px] opacity-100 shadow-[0_0_10px_rgba(255,120,30,0.7)]"
                    : "w-[10px] h-[10px] opacity-0"
                )}
                style={{
                  left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />

              {/* Video Preview */}
              <VideoPreview
                src={src}
                isM3U8={isM3U8}
                currentTime={currentTime}
                duration={duration}
                isHovering={isProgressHovering || isProgressTouching}
                mouseX={isProgressTouching ? progressTouchX : progressMouseX}
                containerRef={progressContainerRef}
                poster={poster}
              />
            </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className={cn(
                  "text-white hover:bg-white/20",
                  isMobile() && "h-9 w-9"
                )}
              >
                {isPlaying ? (
                  <Pause className={cn(isMobile() ? "w-5 h-5" : "w-5 h-5")} />
                ) : (
                  <Play className={cn(isMobile() ? "w-5 h-5" : "w-5 h-5")} />
                )}
              </Button>

              {/* Volume - Desktop only */}
              {!isMobile() && (
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
              )}

              <span className={cn(
                "text-white ml-1 md:ml-2",
                isMobile() ? "text-xs font-medium" : "text-sm"
              )}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              {hlsStats && (
                <span className="text-white/60 text-xs ml-2 hidden sm:inline">
                  {hlsStats.level}p
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 md:gap-2">
              {/* Mobile: settings gear */}
              {isMobile() && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMobileSettings(prev => !prev);
                  }}
                  className="text-white hover:bg-white/20 h-9 w-9"
                >
                  <Settings className="w-5 h-5" />
                </Button>
              )}

              {/* Desktop: Subtitles dropdown */}
              {!isMobile() && subtitles.length > 0 && (
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

              {/* Desktop: PiP & Settings */}
              {!isMobile() && (
                <>
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                        <Settings className="w-5 h-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
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
                              <DropdownMenuItem key={levelIndex} onClick={() => handleQualityChange(levelIndex)}>
                                <span className="flex-1">{level.height}p</span>
                                {currentLevel === levelIndex && <Check className="w-4 h-4 ml-2" />}
                              </DropdownMenuItem>
                            );
                          })}
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuLabel>Playback Speed</DropdownMenuLabel>
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                        <DropdownMenuItem key={speed} onClick={() => handlePlaybackSpeedChange(speed)}>
                          <span className="flex-1">{speed}x</span>
                          {playbackSpeed === speed && <Check className="w-4 h-4 ml-2" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}

              {/* Fullscreen */}
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                className={cn(
                  "text-white hover:bg-white/20",
                  isMobile() && "h-9 w-9"
                )}
              >
                {isFullscreen ? (
                  <Minimize className={cn(isMobile() ? "w-5 h-5" : "w-5 h-5")} />
                ) : (
                  <Maximize className={cn(isMobile() ? "w-5 h-5" : "w-5 h-5")} />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Settings Panel - slide up from bottom */}
      {isMobile() && showMobileSettings && (
        <div
          className="absolute inset-0 z-50 flex flex-col justify-end"
          onClick={(e) => {
            e.stopPropagation();
            setShowMobileSettings(false);
          }}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative bg-zinc-900/95 backdrop-blur-xl rounded-t-2xl border-t border-white/10 p-4 pb-6 animate-in slide-in-from-bottom duration-300 max-h-[60%] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />

            {/* Tab buttons */}
            <div className="flex gap-2 mb-4">
              {[
                { id: 'quality' as const, label: 'Quality', icon: <Sun className="w-4 h-4" /> },
                { id: 'speed' as const, label: 'Speed', icon: <SkipForward className="w-4 h-4" /> },
                ...(subtitles.length > 0 ? [{ id: 'subtitles' as const, label: 'Subs', icon: <Subtitles className="w-4 h-4" /> }] : [])
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setMobileSettingsTab(tab.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all touch-manipulation",
                    mobileSettingsTab === tab.id
                      ? "bg-fox-orange text-white"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Quality tab */}
            {mobileSettingsTab === 'quality' && (
              <div className="space-y-1.5">
                <button
                  onClick={() => { handleQualityChange(-1); setShowMobileSettings(false); }}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all touch-manipulation",
                    currentLevel === -1 ? "bg-fox-orange/20 text-fox-orange" : "bg-white/5 text-white hover:bg-white/10"
                  )}
                >
                  <span className="font-medium">Auto</span>
                  {currentLevel === -1 && <Check className="w-4 h-4" />}
                </button>
                {[...availableLevels].reverse().map((level, index) => {
                  const levelIndex = availableLevels.length - 1 - index;
                  return (
                    <button
                      key={levelIndex}
                      onClick={() => { handleQualityChange(levelIndex); setShowMobileSettings(false); }}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all touch-manipulation",
                        currentLevel === levelIndex ? "bg-fox-orange/20 text-fox-orange" : "bg-white/5 text-white hover:bg-white/10"
                      )}
                    >
                      <span className="font-medium">{level.height}p</span>
                      {currentLevel === levelIndex && <Check className="w-4 h-4" />}
                    </button>
                  );
                })}
                {availableLevels.length === 0 && (
                  <p className="text-white/40 text-sm text-center py-4">Quality options will appear once the stream loads</p>
                )}
              </div>
            )}

            {/* Speed tab */}
            {mobileSettingsTab === 'speed' && (
              <div className="grid grid-cols-3 gap-2">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => { handlePlaybackSpeedChange(speed); setShowMobileSettings(false); }}
                    className={cn(
                      "flex items-center justify-center px-3 py-3 rounded-xl text-sm font-medium transition-all touch-manipulation",
                      playbackSpeed === speed ? "bg-fox-orange text-white" : "bg-white/5 text-white hover:bg-white/10"
                    )}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}

            {/* Subtitles tab */}
            {mobileSettingsTab === 'subtitles' && subtitles.length > 0 && (
              <div className="space-y-1.5">
                <button
                  onClick={() => { handleSubtitleSelect(null); setShowMobileSettings(false); }}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all touch-manipulation",
                    !selectedSubtitle ? "bg-fox-orange/20 text-fox-orange" : "bg-white/5 text-white hover:bg-white/10"
                  )}
                >
                  <span className="font-medium">Off</span>
                  {!selectedSubtitle && <Check className="w-4 h-4" />}
                </button>
                {subtitles.map((sub, i) => (
                  <button
                    key={i}
                    onClick={() => { handleSubtitleSelect(sub.lang); setShowMobileSettings(false); }}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all touch-manipulation",
                      selectedSubtitle === sub.lang ? "bg-fox-orange/20 text-fox-orange" : "bg-white/5 text-white hover:bg-white/10"
                    )}
                  >
                    <span className="font-medium">{sub.label || sub.lang}</span>
                    {selectedSubtitle === sub.lang && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}