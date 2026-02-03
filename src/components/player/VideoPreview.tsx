import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { cn } from '@/lib/utils';

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

  // Calculate preview time and position based on mouseX
  useEffect(() => {
    if (!containerRef.current || !isHovering) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(mouseX - rect.left, rect.width));
    const percentage = x / rect.width;
    const time = percentage * duration;

    setPreviewTime(time);
    setPosition(x);

    if (videoRef.current && isReady) {
      videoRef.current.currentTime = time;
    }
  }, [mouseX, isHovering, duration, containerRef, isReady]);

  // Initialize preview video
  useEffect(() => {
    if (!src || !isHovering) {
      setIsReady(false);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (isM3U8 && Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 1,
        maxMaxBufferLength: 2,
        backBufferLength: 0,
        startLevel: 0, // Lowest quality for fastest scrubbing
      });

      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsReady(true);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error("Preview HLS Error:", data);
          setIsReady(false);
        }
      });
    } else {
      video.src = src;
      video.onloadeddata = () => setIsReady(true);
      video.onerror = () => setIsReady(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      setIsReady(false);
    };
  }, [src, isM3U8, isHovering]);

  if (!isHovering) return null;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="absolute bottom-6 pointer-events-none transform -translate-x-1/2 flex flex-col items-center z-50 transition-all duration-200"
      style={{
        left: position,
        opacity: isHovering ? 1 : 0,
        scale: isHovering ? 1 : 0.95
      }}
    >
      <div className="relative w-48 aspect-video bg-black/90 rounded-xl border-2 border-white/20 overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-fox-orange/20 via-transparent to-transparent opacity-50" />

        <video
          ref={videoRef}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            isReady ? "opacity-100" : "opacity-0"
          )}
          muted
          playsInline
        />

        {/* Fallback/Loading poster */}
        {!isReady && (
          <img
            src={poster}
            className="absolute inset-0 w-full h-full object-cover blur-md opacity-40 scale-110"
            alt="Loading preview..."
          />
        )}

        {/* Loading Spinner */}
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-[3px] border-fox-orange/20 border-t-fox-orange rounded-full animate-spin" />
          </div>
        )}

        {/* Time Badge */}
        <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-bold text-white border border-white/10 shadow-lg">
          {formatTime(previewTime)}
        </div>

        {/* Scanline Effect */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_2px,3px_100%] opacity-20" />
      </div>

      {/* Tooltip Arrow */}
      <div className="w-3 h-3 bg-black/90 border-r border-b border-white/10 rotate-45 -mt-1.5 shadow-xl" />
    </div>
  );
};