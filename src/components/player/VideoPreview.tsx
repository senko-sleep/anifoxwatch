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
  const [sampledTime, setSampledTime] = useState(0);

  // Sample time to nearest 20-second interval
  const getSampledTime = useCallback((time: number) => {
    return Math.round(time / 1) * 1; // Round to nearest 10 seconds
  }, []);

  // Calculate preview time based on mouse position - instant
  useEffect(() => {
    if (!isHovering || !containerRef.current || !duration) return;

    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = mouseX - rect.left;
    const percentage = Math.max(0, Math.min(1, relativeX / rect.width));
    const time = percentage * duration;
    
    // Sample to 20-second intervals
    const sampled = getSampledTime(time);
    setPreviewTime(time);
    setSampledTime(sampled);
    
    // Position preview above the slider (much closer)
    const previewX = relativeX;
    const previewY = -30; // Much closer to slider
    
    setPreviewPosition({ x: previewX, y: previewY });
  }, [isHovering, mouseX, containerRef, duration, getSampledTime]);

  // Initialize video element - instant setup
  useEffect(() => {
    if (!videoRef.current || !videoSrc) return;

    const video = videoRef.current;
    
    // Set up video element for instant seeking
    video.src = videoSrc;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto'; // Preload for instant seeking

    const handleLoadedMetadata = () => {
      setIsVideoReady(true);
    };

    const handleError = () => {
      setIsVideoReady(false);
      console.error('Preview video failed to load');
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };
  }, [videoSrc]);

  // Seek to sampled preview time - 20s intervals only
  useEffect(() => {
    if (!isHovering || !videoRef.current || !isVideoReady) return;

    const video = videoRef.current;
    
    // Only seek to 10-second intervals for performance
    video.currentTime = sampledTime;
    
  }, [sampledTime, isHovering, isVideoReady]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isHovering || !duration) return null;

  return (
    <>
      {/* Hidden video element for preview */}
      <video
        ref={videoRef}
        className="hidden"
        poster={poster}
      />
      
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
        {/* Video preview - 20s interval sampling */}
        <div className="relative w-full h-full">
          {isVideoReady && videoRef.current ? (
            <video
              className="w-full h-full object-cover"
              src={videoSrc}
              muted={true}
              playsInline={true}
              crossOrigin="anonymous"
              preload="auto"
              ref={(video) => {
                if (video) {
                  video.currentTime = sampledTime; // Use sampled time
                }
              }}
            />
          ) : poster ? (
            <img
              src={poster}
              alt="Video poster"
              className="w-full h-full object-cover opacity-60"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-white/50 text-xs">Loading...</div>
            </div>
          )}
          
          {/* Time overlay - show actual time, not sampled time */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
            <span className="text-white text-xs font-medium">
              {formatTime(previewTime)}
            </span>
            {/* Show sampled time indicator */}
            {Math.abs(previewTime - sampledTime) > 1 && (
              <span className="text-white/60 text-xs ml-1">
                (~{formatTime(sampledTime)})
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
