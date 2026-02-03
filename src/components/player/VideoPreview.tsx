import { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface VideoPreviewProps {
  videoSrc: string;
  currentTime: number;
  duration: number;
  isHovering: boolean;
  mouseX: number;
  containerRef: React.RefObject<HTMLDivElement>;
  poster?: string;
}

export function VideoPreview({
  videoSrc,
  currentTime,
  duration,
  isHovering,
  mouseX,
  containerRef,
  poster
}: VideoPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [currentPreviewTime, setCurrentPreviewTime] = useState(0);

  // Sample time to nearest 1-second interval for better accuracy
  const getSampledTime = useCallback((time: number) => {
    return Math.round(time); // Round to nearest second for better accuracy
  }, []);

  // Calculate preview time based on mouse position - instant
  useEffect(() => {
    if (!isHovering || !containerRef.current || !duration) return;

    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = mouseX - rect.left;
    const percentage = Math.max(0, Math.min(1, relativeX / rect.width));
    const time = percentage * duration;

    setPreviewTime(time);

    // Position preview above the slider (much closer)
    const previewX = relativeX;
    const previewY = -30; // Much closer to slider

    setPreviewPosition({ x: previewX, y: previewY });
  }, [isHovering, mouseX, containerRef, duration]);

  // Initialize video element for direct frame preview
  useEffect(() => {
    if (!videoRef.current || !videoSrc) return;

    const video = videoRef.current;

    // Reset state when video source changes
    setIsVideoReady(false);
    console.log('[VideoPreview] Video source changed, reinitializing');

    // Set up video element for direct preview
    video.src = videoSrc;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    const handleLoadedMetadata = () => {
      setIsVideoReady(true);
      console.log('[VideoPreview] Preview video metadata loaded');
    };

    const handleError = (e: Event) => {
      setIsVideoReady(false);
      console.error('Preview video failed to load:', e);
    };

    const handleSeeked = () => {
      // Video is ready to show the current frame
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);
    video.addEventListener('seeked', handleSeeked);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
      video.removeEventListener('seeked', handleSeeked);
    };
  }, [videoSrc]);

  // Update video time when hovering
  useEffect(() => {
    if (!isHovering || !videoRef.current || !isVideoReady || !duration) return;

    const sampledTime = getSampledTime(previewTime);
    const video = videoRef.current;

    // Seek to the correct time whenever previewTime changes
    if (sampledTime >= 0 && sampledTime <= duration) {
      // Ensure we're not already at the correct time
      if (Math.abs(video.currentTime - sampledTime) > 0.5) {
        video.currentTime = sampledTime;
        setCurrentPreviewTime(sampledTime);
      }
    }
  }, [isHovering, previewTime, isVideoReady, duration, getSampledTime]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isHovering || !duration) return null;

  return (
    <>
      {/* Preview popup */}
      <div
        ref={previewRef}
        className={cn(
          "absolute z-50 bg-black/90 backdrop-blur-sm rounded-lg overflow-hidden border border-white/20 shadow-2xl transition-all duration-75 pointer-events-none",
          "transform -translate-x-1/2"
        )}
        style={{
          left: `${previewPosition.x}px`,
          bottom: `${Math.abs(previewPosition.y)}px`,
          width: '140px',
          height: '100px',
          opacity: isHovering ? 1 : 0,
        }}
      >
        {/* Video preview - direct video element */}
        <div className="relative w-full h-full">
          {isVideoReady ? (
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              src={videoSrc}
              muted={true}
              playsInline={true}
              crossOrigin="anonymous"
              preload="metadata"
            />
          ) : poster ? (
            <img
              src={poster}
              alt="Video poster"
              className="w-full h-full object-cover opacity-60"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-white/50 text-xs">Loading preview...</div>
            </div>
          )}

          {/* Time overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
            <span className="text-white text-xs font-medium">
              {formatTime(previewTime)}
            </span>
            {/* Show sampled time indicator */}
            {Math.abs(previewTime - getSampledTime(previewTime)) > 1 && (
              <span className="text-white/60 text-xs ml-1">
                (~{formatTime(getSampledTime(previewTime))})
              </span>
            )}
          </div>
        </div>

        {/* Triangle pointer */}
        <div
          className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full"
          style={{
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid rgba(0, 0, 0, 0.9)',
          }}
        />
      </div>
    </>
  );
}
