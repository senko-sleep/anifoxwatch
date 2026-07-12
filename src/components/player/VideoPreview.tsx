import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface VideoPreviewHandle {
  /** Called by VideoPlayer on timeupdate to cache a frame from the main video. */
  captureFrame: (video: HTMLVideoElement, time: number) => void;
}

export interface VideoPreviewProps {
  /** Main video element ref — we read frames from it, no second HLS stream. */
  videoRef: React.RefObject<HTMLVideoElement>;
  duration: number;
  isHovering: boolean;
  mouseX: number;
  containerRef: React.RefObject<HTMLDivElement>;
  /** Anime poster shown as placeholder before any frame is cached. */
  poster: string;
  /** Set false if the video is cross-origin tainted (canvas capture will fail). */
  canCapture?: boolean;
}

// ─── Frame cache ─────────────────────────────────────────────────────────────

/** Capture one frame every N seconds while playing. */
const CACHE_INTERVAL_S = 10;
const FRAME_W = 240;
const FRAME_H = 135;

interface FrameEntry { time: number; dataUrl: string }

// Module-level cache: keyed by video.currentSrc so quality switches keep existing frames.
const frameCache = new Map<string, FrameEntry[]>();

function getCacheKey(video: HTMLVideoElement): string {
  return video.currentSrc || video.src || 'unknown';
}

function getNearestFrame(frames: FrameEntry[], targetTime: number): FrameEntry | null {
  if (!frames.length) return null;
  let best = frames[0];
  let bestDist = Math.abs(frames[0].time - targetTime);
  for (const f of frames) {
    const d = Math.abs(f.time - targetTime);
    if (d < bestDist) { best = f; bestDist = d; }
  }
  return best;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const VideoPreview = forwardRef<VideoPreviewHandle, VideoPreviewProps>(({
  videoRef,
  duration,
  isHovering,
  mouseX,
  containerRef,
  poster,
  canCapture = true,
}, ref) => {
  const [previewTime, setPreviewTime] = useState(0);
  const [position, setPosition] = useState(0);
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureFailedRef = useRef(false);

  // Lazily create an off-screen canvas for frame capture
  const getCanvas = useCallback((): HTMLCanvasElement => {
    if (!captureCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = FRAME_W;
      c.height = FRAME_H;
      captureCanvasRef.current = c;
    }
    return captureCanvasRef.current;
  }, []);

  // ── Expose captureFrame so VideoPlayer can call it from timeupdate ────────
  useImperativeHandle(ref, () => ({
    captureFrame(video: HTMLVideoElement, time: number) {
      if (captureFailedRef.current || !canCapture) return;
      if (video.readyState < 2 || video.videoWidth === 0) return;

      const key = getCacheKey(video);
      const frames = frameCache.get(key) ?? [];

      const lastCaptured = frames[frames.length - 1]?.time ?? -999;
      // Only capture once per CACHE_INTERVAL_S
      if (time - lastCaptured < CACHE_INTERVAL_S) return;

      try {
        const canvas = getCanvas();
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, FRAME_W, FRAME_H);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        frames.push({ time, dataUrl });
        frameCache.set(key, frames);
      } catch {
        // SecurityError — cross-origin tainted canvas
        captureFailedRef.current = true;
      }
    },
  }), [canCapture, getCanvas]);

  // ── Track mouse position & pick nearest frame ────────────────────────────
  useEffect(() => {
    if (!isHovering || !containerRef.current || !duration) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(mouseX - rect.left, rect.width));
    const pct = x / rect.width;
    const time = pct * duration;

    setPreviewTime(time);
    setPosition(x);

    const video = videoRef.current;
    if (video) {
      const key = getCacheKey(video);
      const frames = frameCache.get(key) ?? [];
      const nearest = getNearestFrame(frames, time);
      setFrameDataUrl(nearest?.dataUrl ?? null);
    }
  }, [mouseX, isHovering, duration, containerRef, videoRef]);

  // ── Time formatter ───────────────────────────────────────────────────────
  const formatTime = useCallback((s: number): string => {
    if (!isFinite(s) || s < 0) return '0:00';
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // ── Layout: clamp so tooltip never overflows the bar ─────────────────────
  const PREVIEW_W = 220;
  const containerRect = containerRef.current?.getBoundingClientRect();
  const halfW = PREVIEW_W / 2 + 8;
  const containerWidth = containerRect?.width ?? 800;
  const clampedLeft = Math.max(halfW, Math.min(position, containerWidth - halfW));

  if (!isHovering) return null;

  // Show cached frame → poster → gradient placeholder
  const imgSrc = frameDataUrl ?? poster ?? null;

  return (
    <div
      className="absolute bottom-8 pointer-events-none flex flex-col items-center z-50"
      style={{
        left: clampedLeft,
        transform: 'translateX(-50%)',
        animation: 'vp-fadeIn 100ms ease both',
      }}
    >
      {/* ── Preview card ── */}
      <div
        className="relative overflow-hidden rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.85)]"
        style={{ width: PREVIEW_W, height: 124 }}
      >
        {/* Border glow */}
        <div className="absolute -inset-px rounded-lg border border-white/20 z-10 pointer-events-none" />

        {imgSrc ? (
          <img
            src={imgSrc}
            className="absolute inset-0 w-full h-full object-cover"
            alt=""
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[rgba(255,120,30,0.18)] to-black/70 flex items-center justify-center">
            <span className="text-white/25 text-xs select-none">Loading…</span>
          </div>
        )}

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