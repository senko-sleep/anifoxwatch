import { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface VideoPreviewProps {
  videoElement: HTMLVideoElement | null;
  currentTime: number;
  duration: number;
  isHovering: boolean;
  mouseX: number;
  containerRef: React.RefObject<HTMLDivElement>;
  poster?: string;
}

export function VideoPreview({
  videoElement,
  currentTime,
  duration,
  isHovering,
  mouseX,
  containerRef,
  poster
}: VideoPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate preview time based on mouse position
  useEffect(() => {
    if (!isHovering || !containerRef.current || !duration) return;

    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = mouseX - rect.left;
    const percentage = Math.max(0, Math.min(1, relativeX / rect.width));
    const time = percentage * duration;

    setPreviewTime(time);

    // Position preview above the slider
    const previewX = relativeX;
    const previewY = -30;

    setPreviewPosition({ x: previewX, y: previewY });
  }, [isHovering, mouseX, containerRef, duration]);

  // Debounced frame capture to prevent performance issues
  const captureFrameDebounced = useCallback((time: number) => {
    if (!videoElement || !canvasRef.current) {
      setPreviewImage(null);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Set canvas dimensions to match preview size
    canvas.width = 140;
    canvas.height = 100;

    const captureFrame = () => {
      try {
        // Temporarily seek to preview time to capture frame
        videoElement.currentTime = time;
        setIsLoading(true);
      } catch (error) {
        console.error('Error seeking video for preview:', error);
        setIsLoading(false);
      }
    };

    // Debounce seek operations
    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current);
    }

    seekTimeoutRef.current = setTimeout(captureFrame, 100);
  }, [videoElement]);

  // Capture video frame for preview
  useEffect(() => {
    if (!isHovering) {
      setPreviewImage(null);
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
      return;
    }

    captureFrameDebounced(previewTime);

    return () => {
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, [isHovering, previewTime, captureFrameDebounced]);

  // Listen for seeked event to capture the frame
  useEffect(() => {
    if (!videoElement || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    const handleSeeked = () => {
      try {
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        setPreviewImage(imageData);
      } catch (error) {
        console.error('Error capturing video frame:', error);
        setPreviewImage(null);
      } finally {
        setIsLoading(false);
      }
    };

    videoElement.addEventListener('seeked', handleSeeked);

    return () => {
      videoElement.removeEventListener('seeked', handleSeeked);
    };
  }, [videoElement]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isHovering || !duration) return null;

  return (
    <>
      {/* Hidden canvas for capturing video frames */}
      <canvas ref={canvasRef} className="hidden" />

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
        {/* Preview image */}
        <div className="relative w-full h-full">
          {previewImage ? (
            <img
              src={previewImage}
              alt="Video preview"
              className="w-full h-full object-cover"
            />
          ) : isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            </div>
          ) : poster ? (
            <img
              src={poster}
              alt="Video preview"
              className="w-full h-full object-cover opacity-80"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-white/50 text-xs">Preview</div>
            </div>
          )}

          {/* Time overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
            <span className="text-white text-xs font-medium">
              {formatTime(previewTime)}
            </span>
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
