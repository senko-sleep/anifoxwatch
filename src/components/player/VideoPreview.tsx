import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { PostProxyLoader } from '@/lib/hls-post-loader';

export interface VideoPreviewProps {
  src: string;
  isM3U8: boolean;
  currentTime: number;
  duration: number;
  isHovering: boolean;
  mouseX: number;
  containerRef: React.RefObject<HTMLDivElement>;
  poster: string;
}

export const VideoPreview = ({
  src,
  isM3U8,
  currentTime,
  duration,
  isHovering,
  mouseX,
  containerRef,
  poster
}: VideoPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [previewTime, setPreviewTime] = useState(0);
  const [position, setPosition] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const lastSeekTimeRef = useRef(0);

  const PREVIEW_W = 220;
  const PREVIEW_H = 124;

  const formatTime = useCallback((seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Pre-initialize preview video as soon as src is available (NOT on hover)
  // IMPORTANT: video element is ALWAYS rendered (hidden) so this ref is never null
  useEffect(() => {
    if (!src) return;

    const video = videoRef.current;
    if (!video) return;

    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    // Pause first to stop any previous playback
    video.pause();

    if (isM3U8 && Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: false,
        maxBufferLength: 5,
        maxMaxBufferLength: 10,
        backBufferLength: 5,
        startLevel: 0,
        loader: PostProxyLoader,
        xhrSetup: (xhr) => { xhr.timeout = 15000; },
      });

      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('[VideoPreview] HLS manifest parsed, ready for seeking');
        setIsReady(true);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error('[VideoPreview] Fatal HLS error:', data.type);
          setIsReady(false);
        }
      });
    } else {
      video.src = src;
      video.onloadeddata = () => {
        console.log('[VideoPreview] Video loaded, ready for seeking');
        setIsReady(true);
      };
      video.onerror = () => {
        console.error('[VideoPreview] Video load error');
        setIsReady(false);
      };
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      setIsReady(false);
    };
  }, [src, isM3U8]);

  // Seek the preview video when hovering
  useEffect(() => {
    if (!isHovering || !containerRef.current || !duration) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(mouseX - rect.left, rect.width));
    const percentage = x / rect.width;
    const time = percentage * duration;

    setPreviewTime(time);
    setPosition(x);

    const video = videoRef.current;
    if (!video || !isReady) return;

    // Throttle seeks to avoid overwhelming the decoder
    const now = performance.now();
    if (now - lastSeekTimeRef.current < 60) return;
    lastSeekTimeRef.current = now;

    // Pause playback and seek to exact position for frame display
    video.pause();
    video.currentTime = time;
  }, [mouseX, isHovering, duration, containerRef, isReady]);

  // Clamp the tooltip position so it doesn't overflow the progress bar
  const containerRect = containerRef.current?.getBoundingClientRect();
  const halfW = PREVIEW_W / 2 + 8;
  const containerWidth = containerRect?.width ?? 800;
  const clampedPosition = Math.max(halfW, Math.min(position, containerWidth - halfW));

  return (
    <>
      {/* Hidden preview video — ALWAYS rendered so HLS can attach and preload on mount */}
      <video
        ref={videoRef}
        className="absolute w-0 h-0 opacity-0 pointer-events-none"
        muted
        playsInline
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Preview tooltip — only visible on hover */}
      {isHovering && (
        <div
          className="absolute bottom-8 pointer-events-none flex flex-col items-center z-50"
          style={{
            left: clampedPosition,
            transform: 'translateX(-50%)',
            opacity: 1,
            transition: 'left 50ms linear, opacity 150ms ease',
          }}
        >
          {/* Preview Card — Netflix-style */}
          <div
            className="relative overflow-hidden rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.8)]"
            style={{ width: PREVIEW_W, height: PREVIEW_H }}
          >
            {/* Border glow */}
            <div className="absolute -inset-px rounded-lg border border-white/20 z-10 pointer-events-none" />

            {/* Preview canvas — draws the hidden video's current frame */}
            <PreviewCanvas videoRef={videoRef} width={PREVIEW_W} height={PREVIEW_H} isHovering={isHovering} poster={poster} />

            {/* Time Badge — centered bottom */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent pt-5 pb-1.5 px-2 flex justify-center z-10">
              <span className="text-[11px] font-bold text-white tabular-nums tracking-wide drop-shadow-lg">
                {formatTime(previewTime)}
              </span>
            </div>
          </div>

          {/* Arrow indicator */}
          <div className="w-2.5 h-2.5 bg-black rotate-45 -mt-[5px] border-r border-b border-white/15 shadow-xl" />
        </div>
      )}
    </>
  );
};

/**
 * Draws frames from the preview video onto a canvas.
 * Falls back to showing the video element directly if canvas capture fails (CORS).
 */
function PreviewCanvas({
  videoRef,
  width,
  height,
  isHovering,
  poster,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  width: number;
  height: number;
  isHovering: boolean;
  poster: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isHovering) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    let active = true;

    const draw = () => {
      if (!active) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2 && !canvasFailed) {
        try {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            if (!hasFrame) setHasFrame(true);
          }
        } catch {
          setCanvasFailed(true);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isHovering, videoRef, width, height, canvasFailed, hasFrame]);

  // If canvas capture fails (CORS), show poster as fallback
  if (canvasFailed) {
    return (
      <img
        src={poster}
        className="absolute inset-0 w-full h-full object-cover"
        alt=""
      />
    );
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-full object-cover"
        style={{ opacity: hasFrame ? 1 : 0, transition: 'opacity 80ms ease' }}
      />
      {/* Poster fallback while waiting for first frame */}
      {!hasFrame && (
        <img
          src={poster}
          className="absolute inset-0 w-full h-full object-cover opacity-60"
          alt=""
        />
      )}
    </>
  );
}