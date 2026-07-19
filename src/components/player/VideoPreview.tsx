import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useLayoutEffect,
} from 'react';
import Hls from 'hls.js';

// â”€â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface VideoPreviewHandle {
  /** Called by VideoPlayer on timeupdate â€” kept for backwards compat but unused now. */
  captureFrame: (video: HTMLVideoElement, time: number) => void;
}

export interface VideoPreviewProps {
  /** Main video element ref â€” we clone its src for the hidden seek-video. */
  videoRef: React.RefObject<HTMLVideoElement>;
  duration: number;
  isHovering: boolean;
  mouseX: number;
  containerRef: React.RefObject<HTMLDivElement>;
  /** Anime poster shown while hidden video is seeking. */
  poster: string;
  /** Set false if the video is cross-origin tainted (canvas capture will fail). */
  canCapture?: boolean;
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PREVIEW_W = 224;
const PREVIEW_H = 126; // 16:9
const SEEK_DEBOUNCE_MS = 100; // Increased debounce to reduce rapid seeks
const SEEKED_TIMEOUT_MS = 3000; // Increased timeout for HLS buffering (3s)

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const VideoPreview = forwardRef<VideoPreviewHandle, VideoPreviewProps>((
  { videoRef, duration, isHovering, mouseX, containerRef, poster, canCapture = true },
  ref
) => {
  const [previewTime, setPreviewTime] = useState(0);
  const [position, setPosition] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hlsReady, setHlsReady] = useState(false);

  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSrcRef = useRef<string>('');
  const lastSeekTimeRef = useRef<number>(-1);
  const hlsRef = useRef<Hls | null>(null);

  // Backwards-compat: captureFrame is now a no-op since we seek live
  useImperativeHandle(ref, () => ({
    captureFrame: (_video: HTMLVideoElement, _time: number) => { /* no-op: live seek handles previews */ },
  }), []);

  // â”€â”€ Create / manage the hidden video element â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useLayoutEffect(() => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(v);
    hiddenVideoRef.current = v;

    return () => {
      v.src = '';
      v.load();
      if (document.body.contains(v)) document.body.removeChild(v);
      hiddenVideoRef.current = null;
    };
  }, []);

  // â”€â”€ Sync src from main video when it changes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const mainVideo = videoRef.current;
    const hidden = hiddenVideoRef.current;
    if (!hidden || !mainVideo) return;

    const syncSrc = () => {
      const src = mainVideo.currentSrc || mainVideo.src;
      if (!src || src === lastSrcRef.current) return;
      lastSrcRef.current = src;
      setIsReady(false);
      setHlsReady(false);
      lastSeekTimeRef.current = -1;

      // Check if it's an HLS stream
      const isHls = src.includes('.m3u8') || src.includes('m3u8');

      if (isHls && Hls.isSupported()) {
        // Destroy existing HLS instance
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }

        // Create new HLS instance for preview
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 5,
          maxBufferLength: 10,
          maxMaxBufferLength: 20,
          // Optimized for seeking: smaller buffers, faster startup
          startLevel: -1,
          abrEwmaDefaultEstimate: 500_000, // Start low for quick seek
          fragLoadingMaxRetry: 3,
          manifestLoadingMaxRetry: 2,
          fragLoadingRetryDelay: 100,
          manifestLoadingRetryDelay: 200,
          fragLoadingTimeOut: 5000,
          manifestLoadingTimeOut: 8000,
        });

        hls.loadSource(src);
        hls.attachMedia(hidden);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('[VideoPreview] HLS manifest parsed, ready for seeking');
          // Start playing muted in background to enable seeking
          hidden.play().then(() => {
            console.log('[VideoPreview] Hidden video started playing');
            // Pause immediately after first frame to save bandwidth
            setTimeout(() => {
              hidden.pause();
              setHlsReady(true);
            }, 500);
          }).catch((err) => {
            console.warn('[VideoPreview] Autoplay blocked:', err);
            hidden.pause();
            setHlsReady(true);
          });
        });

        hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
          console.log('[VideoPreview] HLS fragment loaded:', data.frag.sn);
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('[VideoPreview] HLS error:', data.type, data.details, data.fatal);
          if (data.fatal) {
            hls.destroy();
            hlsRef.current = null;
            setHlsReady(false);
          }
        });

        hlsRef.current = hls;
      } else {
        // Direct video source (MP4, etc.)
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        hidden.src = src;
        hidden.load();
        hidden.pause();
      }
    };

    // Sync immediately and whenever the main video's src changes
    syncSrc();
    mainVideo.addEventListener('loadedmetadata', syncSrc);
    return () => {
      mainVideo.removeEventListener('loadedmetadata', syncSrc);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoRef]);

  // â”€â”€ Paint one frame to the canvas via rAF â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const paintFrame = useCallback(() => {
    const hidden = hiddenVideoRef.current;
    const canvas = canvasRef.current;
    if (!hidden || !canvas) return;
    if (hidden.readyState < 2 || hidden.videoWidth === 0) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    try {
      ctx.drawImage(hidden, 0, 0, PREVIEW_W, PREVIEW_H);
      setIsReady(true);
      setIsSeeking(false);
    } catch (err) {
      // CORS error - video is tainted, can't capture
      console.warn('[VideoPreview] Canvas capture failed (CORS):', err);
      setIsSeeking(false);
    }
  }, []);

  // â”€â”€ Seek the hidden video to a target time â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const seekTo = useCallback((time: number) => {
    const hidden = hiddenVideoRef.current;
    const hls = hlsRef.current;
    if (!hidden || !hidden.src) return;
    
    // For HLS, wait until manifest is parsed before seeking
    if (hls && hls.media === hidden && !hlsReady) {
      console.log('[VideoPreview] HLS not ready yet, skipping seek');
      return;
    }
    
    // Skip if already at this frame (reduced tolerance for smoother previews)
    if (Math.abs(time - lastSeekTimeRef.current) < 0.05) return;

    lastSeekTimeRef.current = time;
    setIsSeeking(true);

    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);

    const onSeeked = () => {
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(paintFrame);
      hidden.removeEventListener('seeked', onSeeked);
    };

    hidden.addEventListener('seeked', onSeeked);

    // For HLS, ensure we start loading before seeking
    if (hls && hls.media === hidden) {
      // Trigger HLS to start loading if needed
      hls.startLoad(time);
    }

    hidden.currentTime = time;

    // Guard: if seeked never fires (e.g. cross-origin restriction), paint what we have
    seekTimeoutRef.current = setTimeout(() => {
      hidden.removeEventListener('seeked', onSeeked);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(paintFrame);
    }, SEEKED_TIMEOUT_MS);
  }, [paintFrame, hlsReady]);

  // â”€â”€ Track mouse/touch position â†’ debounced seek â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!isHovering || !containerRef.current || !duration) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(mouseX - rect.left, rect.width));
    const pct = x / rect.width;
    const time = pct * duration;

    setPreviewTime(time);
    setPosition(x);

    if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
    seekDebounceRef.current = setTimeout(() => seekTo(time), SEEK_DEBOUNCE_MS);
  }, [mouseX, isHovering, duration, containerRef, seekTo]);

  // â”€â”€ Cleanup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    return () => {
      if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // â”€â”€ Time formatter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const formatTime = useCallback((s: number): string => {
    if (!isFinite(s) || s < 0) return '0:00';
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // â”€â”€ Layout: clamp so preview never overflows the progress bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const containerRect = containerRef.current?.getBoundingClientRect();
  const halfW = PREVIEW_W / 2 + 8;
  const containerWidth = containerRect?.width ?? 800;
  const clampedLeft = Math.max(halfW, Math.min(position, containerWidth - halfW));

  if (!isHovering) return null;

  return (
    <div
      className="absolute bottom-8 pointer-events-none flex flex-col items-center z-50"
      style={{
        left: clampedLeft,
        transform: 'translateX(-50%)',
        animation: 'vp-fadeIn 100ms ease both',
      }}
    >
      {/* â”€â”€ Preview card â”€â”€ */}
      <div
        className="relative overflow-hidden rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.9)]"
        style={{ width: PREVIEW_W, height: PREVIEW_H }}
      >
        {/* Border glow */}
        <div className="absolute -inset-px rounded-xl border border-white/20 z-10 pointer-events-none" />

        {/* Poster / loading placeholder â€” shown until canvas is ready */}
        <div
          className="absolute inset-0 transition-opacity duration-150"
          style={{ opacity: isReady ? 0 : 1 }}
        >
          {poster ? (
            <img src={poster} className="w-full h-full object-cover" alt="" style={{ opacity: 0.4 }} />
          ) : (
            <div className="absolute inset-0 bg-zinc-900" />
          )}
          {(isSeeking || !hlsReady) && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Live canvas â€” always mounted so seeked frames paint into it immediately */}
        <canvas
          ref={canvasRef}
          width={PREVIEW_W}
          height={PREVIEW_H}
          className="absolute inset-0 w-full h-full"
          style={{ opacity: isReady ? 1 : 0, transition: 'opacity 150ms ease' }}
        />

        {/* Time badge */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent pt-6 pb-1.5 px-2 flex justify-center z-10">
          <span className="text-[13px] font-bold text-white tabular-nums tracking-wide drop-shadow-lg">
            {formatTime(previewTime)}
          </span>
        </div>
      </div>

      {/* Pointer arrow */}
      <div className="w-2.5 h-2.5 bg-black rotate-45 -mt-[5px] border-r border-b border-white/15 shadow-xl" />

      <style>{`
        @keyframes vp-fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(5px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0);   }
        }
      `}</style>
    </div>
  );
});

VideoPreview.displayName = 'VideoPreview';
