import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  useReducer,
  forwardRef,
} from 'react';
import Hls from 'hls.js';
import { PostProxyLoader } from '@/lib/hls-post-loader';
import {
  FrameStore,
  StoryboardBuilder,
  THUMB_W,
  THUMB_H,
  canBuildStoryboard,
} from '@/lib/seek-thumbnails';

// ─── Public API ─────────────────────────────────────────────────────────────

export interface VideoPreviewHandle {
  /** Kept for backwards compat; frames are captured from the main video automatically. */
  captureFrame: (video: HTMLVideoElement, time: number) => void;
}

export interface VideoPreviewProps {
  /** Main video element — frames are captured from it while it plays. */
  videoRef: React.RefObject<HTMLVideoElement>;
  /**
   * The stream URL the player loaded (proxied). The main video's currentSrc is a
   * MediaSource blob under hls.js, which a second element cannot open.
   */
  src?: string;
  isM3U8?: boolean;
  duration: number;
  isHovering: boolean;
  mouseX: number;
  containerRef: React.RefObject<HTMLDivElement>;
  /** Anime poster shown until the first frame exists. */
  poster: string;
  /** While true, the background sweep yields bandwidth to playback. */
  isBuffering?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PREVIEW_W = 224;
const PREVIEW_H = 126; // 16:9
/** The sweep waits this long so it never competes with the first frames of playback. */
const SWEEP_DELAY_MS = 4000;
/** Main-video capture runs at most this often. */
const LIVE_CAPTURE_MS = 1000;
/** Fallback seeker: give up on one seek after this long. */
const FALLBACK_SEEK_TIMEOUT_MS = 4000;

const saveData = () =>
  typeof navigator !== 'undefined' &&
  Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);

const coarsePointer = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/** Background sweep size: every segment on desktop, a coarse grid on phones, none on Save-Data. */
const sweepLimit = () => (saveData() ? 0 : coarsePointer() ? 48 : 400);

const formatTime = (s: number): string => {
  if (!isFinite(s) || s < 0) return '0:00';
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// ─── Fallback: a hidden element seeked on demand ────────────────────────────
// For streams the storyboard cannot read (MP4, fMP4, encrypted HLS, no WebCodecs).

class HiddenSeeker {
  private video = document.createElement('video');
  private hls: Hls | null = null;
  private target: number | null = null;
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(src: string, isM3U8: boolean, private store: FrameStore, private onFrame: () => void) {
    const v = this.video;
    v.muted = true;
    v.preload = 'auto';
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(v);

    if (isM3U8 && Hls.isSupported()) {
      this.hls = new Hls({
        autoStartLoad: false,
        startLevel: 0,
        capLevelToPlayerSize: false,
        maxBufferLength: 2,
        maxMaxBufferLength: 4,
        backBufferLength: 0,
        loader: PostProxyLoader,
      });
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (this.hls) this.hls.currentLevel = 0;
        this.next();
      });
      this.hls.loadSource(src);
      this.hls.attachMedia(v);
    } else {
      v.src = src;
    }
    v.addEventListener('seeked', this.capture);
    v.addEventListener('loadedmetadata', () => this.next());
  }

  request(time: number) {
    this.target = time;
    this.next();
  }

  private next = () => {
    const v = this.video;
    if (this.busy || this.target === null) return;
    if (this.hls ? !this.hls.levels.length : v.readyState < 1) return;
    const time = this.target;
    this.target = null;
    this.busy = true;
    this.hls?.startLoad(time);
    v.currentTime = time;
    this.timer = setTimeout(this.release, FALLBACK_SEEK_TIMEOUT_MS);
  };

  private capture = () => {
    const v = this.video;
    const time = v.currentTime;
    const finish = () => this.release();
    const draw = () => {
      if (v.readyState < 2 || !v.videoWidth) return finish();
      createImageBitmap(v, { resizeWidth: THUMB_W, resizeHeight: THUMB_H, resizeQuality: 'medium' })
        .then((bmp) => { this.store.add(time, bmp); this.onFrame(); })
        .catch(() => { /* tainted or not decoded yet */ })
        .finally(finish);
    };
    // A seeked element may not have decoded the frame yet; wait for it to be presented.
    const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
    if (rvfc && v.readyState < 2) rvfc.call(v, draw); else draw();
  };

  private release = () => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.busy = false;
    this.next();
  };

  destroy() {
    if (this.timer) clearTimeout(this.timer);
    this.hls?.destroy();
    this.video.removeAttribute('src');
    this.video.load();
    this.video.remove();
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export const VideoPreview = forwardRef<VideoPreviewHandle, VideoPreviewProps>((
  { videoRef, src, isM3U8 = true, duration, isHovering, mouseX, containerRef, poster, isBuffering = false },
  ref
) => {
  const [previewTime, setPreviewTime] = useState(0);
  const [position, setPosition] = useState(0);
  const [hasFrame, setHasFrame] = useState(false);
  const [frameTime, setFrameTime] = useState<number | null>(null);
  const [frameVersion, bumpFrames] = useReducer((n: number) => n + 1, 0);
  /** The stream the storyboard could not read; it falls back to the hidden seeker. */
  const [unreadableSrc, setUnreadableSrc] = useState<string | null>(null);
  const useStoryboard = Boolean(src) && src !== unreadableSrc && isM3U8 && canBuildStoryboard();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const storeRef = useRef<FrameStore>();
  if (!storeRef.current) storeRef.current = new FrameStore();
  const builderRef = useRef<StoryboardBuilder | null>(null);
  const seekerRef = useRef<HiddenSeeker | null>(null);

  useImperativeHandle(ref, () => ({
    captureFrame: () => { /* frames are captured from the main video's timeupdate */ },
  }), []);

  // ── One frame source per stream ───────────────────────────────────────────
  useEffect(() => {
    const store = storeRef.current!;
    store.clear();
    setHasFrame(false);
    bumpFrames();
    if (!src) return;

    if (useStoryboard) {
      const builder = new StoryboardBuilder(src, store, {
        onFrame: bumpFrames,
        onUnsupported: () => setUnreadableSrc(src),
        sweepLimit: sweepLimit(),
      });
      builderRef.current = builder;
      const sweep = setTimeout(() => builder.startSweep(), SWEEP_DELAY_MS);
      return () => {
        clearTimeout(sweep);
        builder.destroy();
        builderRef.current = null;
      };
    }

    const seeker = new HiddenSeeker(src, isM3U8, store, bumpFrames);
    seekerRef.current = seeker;
    return () => {
      seeker.destroy();
      seekerRef.current = null;
    };
  }, [src, isM3U8, useStoryboard]);

  useEffect(() => { builderRef.current?.setPaused(isBuffering); }, [isBuffering]);

  useEffect(() => () => storeRef.current?.clear(), []);

  // ── Frames from the main video, free while it plays ───────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let last = 0;
    let busy = false;
    const grab = () => {
      const now = performance.now();
      if (busy || now - last < LIVE_CAPTURE_MS) return;
      if (video.readyState < 2 || video.seeking || !video.videoWidth) return;
      const time = video.currentTime;
      if (storeRef.current!.has(time)) return;
      last = now;
      busy = true;
      createImageBitmap(video, { resizeWidth: THUMB_W, resizeHeight: THUMB_H, resizeQuality: 'medium' })
        .then((bmp) => { storeRef.current!.add(time, bmp); bumpFrames(); })
        .catch(() => { /* tainted cross-origin media: storyboard still covers it */ })
        .finally(() => { busy = false; });
    };
    video.addEventListener('timeupdate', grab);
    return () => video.removeEventListener('timeupdate', grab);
  }, [videoRef]);

  // ── Pointer → time, and ask for that frame ────────────────────────────────
  useEffect(() => {
    if (!isHovering || !containerRef.current || !duration) return;

    // mouseX is relative to the bar, in its own pixels; offsetWidth ignores the
    // player's CSS landscape rotation, unlike getBoundingClientRect.
    const width = containerRef.current.offsetWidth || containerRef.current.getBoundingClientRect().width;
    if (!width) return;
    const x = Math.max(0, Math.min(mouseX, width));
    const time = (x / width) * duration;

    setPreviewTime(time);
    setPosition(x);

    builderRef.current?.startSweep();
    void builderRef.current?.request(time);
    seekerRef.current?.request(time);
  }, [mouseX, isHovering, duration, containerRef]);

  // ── Paint the nearest frame we have, immediately ──────────────────────────
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const frame = storeRef.current!.nearest(previewTime);
    if (!canvas || !frame) { setHasFrame(false); setFrameTime(null); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(frame.bitmap, 0, 0, canvas.width, canvas.height);
    setHasFrame(true);
    setFrameTime(frame.time);
  }, [previewTime]);

  useLayoutEffect(() => {
    if (isHovering) paint();
  }, [isHovering, paint, frameVersion]);

  // ── Layout: clamp so preview never overflows the progress bar ─────────────
  const halfW = PREVIEW_W / 2 + 8;
  const containerWidth = containerRef.current?.offsetWidth || containerRef.current?.getBoundingClientRect().width || 800;
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
      data-testid="seek-preview"
      data-has-frame={hasFrame || undefined}
      data-frame-time={frameTime ?? undefined}
    >
      <div
        className="relative overflow-hidden rounded-xl bg-zinc-900 shadow-[0_8px_32px_rgba(0,0,0,0.9)]"
        style={{ width: PREVIEW_W, height: PREVIEW_H }}
      >
        <div className="absolute -inset-px rounded-xl border border-white/20 z-10 pointer-events-none" />

        {/* Poster until the first real frame exists — no spinner, the bar stays usable. */}
        {!hasFrame && poster && (
          <img src={poster} className="absolute inset-0 w-full h-full object-cover opacity-50" alt="" />
        )}

        <canvas
          ref={canvasRef}
          width={THUMB_W}
          height={THUMB_H}
          className="absolute inset-0 w-full h-full"
          style={{ opacity: hasFrame ? 1 : 0 }}
        />

        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent pt-6 pb-1.5 px-2 flex justify-center z-10">
          <span className="text-[13px] font-bold text-white tabular-nums tracking-wide drop-shadow-lg">
            {formatTime(previewTime)}
          </span>
        </div>
      </div>

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
