import { useState, useCallback, useMemo, useRef } from 'react';
import { Episode } from '@/types/anime';
import { apiClient, StreamingData } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Download,
  FolderDown,
  Loader2,
  CheckCircle2,
  XCircle,
  FileDown,
  HardDrive,
  Package,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Tune these to protect Render.com uptime
const RESOLVE_DELAY_MS = 2500; // ms between each episode resolve (2 API calls each)
const MAX_BATCH_SIZE = 12; // max episodes to resolve in one batch (warn above this)
const DOWNLOAD_DELAY_MS = 500; // ms between individual download triggers

interface DownloadManagerProps {
  episodes: Episode[];
  animeTitle: string;
  animeId: string;
  audioType?: 'sub' | 'dub';
}

interface EpisodeDownloadState {
  episodeId: string;
  episodeNum: number;
  title: string;
  status: 'pending' | 'resolving' | 'ready' | 'downloading' | 'done' | 'error';
  streamUrl?: string;
  isM3U8?: boolean;
  fileSize?: number; // bytes
  progress?: number; // 0-100
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function DownloadManager({
  episodes,
  animeTitle,
  animeId,
  audioType = 'sub',
}: DownloadManagerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [rangeMode, setRangeMode] = useState<'all' | 'custom'>('all');
  const [startEp, setStartEp] = useState(1);
  const [endEp, setEndEp] = useState(episodes.length);
  const [downloadStates, setDownloadStates] = useState<Map<string, EpisodeDownloadState>>(new Map());
  const [isResolving, setIsResolving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Selected episodes based on range
  const selectedEpisodes = useMemo(() => {
    const sorted = [...episodes].sort((a, b) => a.number - b.number);
    if (rangeMode === 'all') return sorted;
    return sorted.filter(ep => ep.number >= startEp && ep.number <= endEp);
  }, [episodes, rangeMode, startEp, endEp]);

  const minEp = useMemo(() => Math.min(...episodes.map(e => e.number)), [episodes]);
  const maxEp = useMemo(() => Math.max(...episodes.map(e => e.number)), [episodes]);

  // Stats
  const resolvedCount = useMemo(() => {
    let count = 0;
    downloadStates.forEach(s => { if (s.status === 'ready' || s.status === 'done' || s.status === 'downloading') count++; });
    return count;
  }, [downloadStates]);

  const doneCount = useMemo(() => {
    let count = 0;
    downloadStates.forEach(s => { if (s.status === 'done') count++; });
    return count;
  }, [downloadStates]);

  const errorCount = useMemo(() => {
    let count = 0;
    downloadStates.forEach(s => { if (s.status === 'error') count++; });
    return count;
  }, [downloadStates]);

  const totalEstimatedSize = useMemo(() => {
    let total = 0;
    downloadStates.forEach(s => { if (s.fileSize) total += s.fileSize; });
    return total;
  }, [downloadStates]);

  const m3u8Count = useMemo(() => {
    let count = 0;
    downloadStates.forEach(s => { if (s.isM3U8 && (s.status === 'ready' || s.status === 'done')) count++; });
    return count;
  }, [downloadStates]);

  const directCount = useMemo(() => {
    let count = 0;
    downloadStates.forEach(s => { if (!s.isM3U8 && s.streamUrl && (s.status === 'ready' || s.status === 'done')) count++; });
    return count;
  }, [downloadStates]);

  // Resolve stream links for all selected episodes
  const resolveStreams = useCallback(async () => {
    if (isResolving) return;
    setIsResolving(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Initialize states
    const initial = new Map<string, EpisodeDownloadState>();
    for (const ep of selectedEpisodes) {
      initial.set(ep.id, {
        episodeId: ep.id,
        episodeNum: ep.number,
        title: ep.title || `Episode ${ep.number}`,
        status: 'pending',
      });
    }
    setDownloadStates(new Map(initial));

    // Resolve each episode sequentially (to avoid hammering the API)
    for (const ep of selectedEpisodes) {
      if (controller.signal.aborted) break;

      setDownloadStates(prev => {
        const next = new Map(prev);
        const state = next.get(ep.id);
        if (state) { state.status = 'resolving'; next.set(ep.id, { ...state }); }
        return next;
      });

      try {
        // Get servers first
        const servers = await apiClient.getEpisodeServers(ep.id);
        const matchingServer = servers.find(s => s.type === audioType) || servers[0];

        // Get streaming links
        const streamData: StreamingData = await apiClient.getStreamingLinks(
          ep.id,
          matchingServer?.name,
          audioType
        );

        if (controller.signal.aborted) break;

        const bestSource = streamData.sources?.[0];
        if (!bestSource) {
          throw new Error('No stream source found');
        }

        // Try to get file size for direct MP4 streams
        let fileSize = 0;
        if (!bestSource.isM3U8 && bestSource.url) {
          try {
            const headResp = await fetch(bestSource.url, {
              method: 'HEAD',
              signal: controller.signal,
            });
            const cl = headResp.headers.get('content-length');
            if (cl) fileSize = parseInt(cl, 10);
          } catch {
            // Estimate ~150MB per episode for direct sources without Content-Length
            fileSize = 150 * 1024 * 1024;
          }
        } else if (bestSource.isM3U8) {
          // HLS streams: estimate ~200MB per episode
          fileSize = 200 * 1024 * 1024;
        }

        setDownloadStates(prev => {
          const next = new Map(prev);
          next.set(ep.id, {
            episodeId: ep.id,
            episodeNum: ep.number,
            title: ep.title || `Episode ${ep.number}`,
            status: 'ready',
            streamUrl: bestSource.url,
            isM3U8: bestSource.isM3U8,
            fileSize,
          });
          return next;
        });
      } catch (err: unknown) {
        if (controller.signal.aborted) break;
        const message = err instanceof Error ? err.message : 'Failed to resolve';
        setDownloadStates(prev => {
          const next = new Map(prev);
          next.set(ep.id, {
            episodeId: ep.id,
            episodeNum: ep.number,
            title: ep.title || `Episode ${ep.number}`,
            status: 'error',
            error: message,
          });
          return next;
        });
      }

      // Rate-limit: generous delay between episodes to protect Render uptime
      // Each episode = 2 API calls (servers + stream), both potentially heavy
      if (!controller.signal.aborted) {
        await new Promise(r => setTimeout(r, RESOLVE_DELAY_MS));
      }
    }

    setIsResolving(false);
  }, [selectedEpisodes, audioType, isResolving]);

  // Download a single episode
  // Opens in a new tab / triggers browser-native download to avoid:
  //   1. Streaming entire video through JS memory (crashes on large files)
  //   2. Keeping a long-lived connection to Render proxy (kills uptime)
  const downloadSingle = useCallback((epId: string) => {
    const state = downloadStates.get(epId);
    if (!state?.streamUrl) return;

    const safeName = animeTitle.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const filename = `${safeName} - Episode ${state.episodeNum}.mp4`;

    if (state.isM3U8) {
      // HLS: copy URL (browser can't natively download these)
      navigator.clipboard.writeText(state.streamUrl);
      toast.info('HLS stream URL copied to clipboard', {
        description: 'Paste into yt-dlp or a video downloader extension',
      });
      return;
    }

    // Direct MP4: trigger browser-native download via anchor click
    // This hands off the download to the browser's download manager,
    // which doesn't hold memory and handles large files properly
    const a = document.createElement('a');
    a.href = state.streamUrl;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setDownloadStates(prev => {
      const next = new Map(prev);
      const s = next.get(epId);
      if (s) { s.status = 'done'; s.progress = 100; next.set(epId, { ...s }); }
      return next;
    });

    toast.success(`Download started: Episode ${state.episodeNum}`);
  }, [downloadStates, animeTitle]);

  // Download all ready episodes sequentially
  // Each triggers a browser-native download (no Render proxy streaming pressure)
  const downloadAll = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);

    const readyEps = [...downloadStates.entries()]
      .filter(([, state]) => state.status === 'ready')
      .sort(([, a], [, b]) => a.episodeNum - b.episodeNum);

    for (const [epId] of readyEps) {
      downloadSingle(epId);
      // Stagger browser downloads slightly so they don't all fire at once
      await new Promise(r => setTimeout(r, DOWNLOAD_DELAY_MS));
    }

    setIsDownloading(false);
    toast.success(`Started ${readyEps.length} downloads`);
  }, [downloadStates, downloadSingle, isDownloading]);

  // Copy all stream URLs to clipboard
  const copyAllUrls = useCallback(() => {
    const urls: string[] = [];
    const sorted = [...downloadStates.values()].sort((a, b) => a.episodeNum - b.episodeNum);
    for (const state of sorted) {
      if (state.streamUrl) {
        urls.push(`# Episode ${state.episodeNum}: ${state.title}`);
        urls.push(state.streamUrl);
        urls.push('');
      }
    }
    navigator.clipboard.writeText(urls.join('\n'));
    toast.success(`Copied ${sorted.filter(s => s.streamUrl).length} stream URLs to clipboard`);
  }, [downloadStates]);

  // Cancel operations
  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setIsResolving(false);
    setIsDownloading(false);
  }, []);

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-fox-orange/30 transition-all text-sm text-zinc-400 hover:text-fox-orange w-full"
      >
        <FolderDown className="w-4 h-4" />
        <span className="font-medium">Download Manager</span>
        <Badge variant="secondary" className="ml-auto text-[10px] bg-white/[0.06]">
          {episodes.length} eps
        </Badge>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <FolderDown className="w-4 h-4 text-fox-orange" />
          <h3 className="text-sm font-semibold text-white">Download Manager</h3>
        </div>
        <div className="flex items-center gap-2">
          {(isResolving || isDownloading) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Cancel
            </Button>
          )}
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-white transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Range Selection */}
      <div className="px-4 py-3 border-b border-white/[0.05] space-y-3">
        <div className="flex items-center gap-2">
          <Select value={rangeMode} onValueChange={(v: 'all' | 'custom') => setRangeMode(v)}>
            <SelectTrigger className="w-[140px] h-8 text-xs bg-white/[0.04] border-white/[0.08]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[hsl(220,20%,8%)] border-white/[0.08]">
              <SelectItem value="all">All Episodes</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {rangeMode === 'custom' && (
            <div className="flex items-center gap-1.5 flex-1">
              <span className="text-[11px] text-zinc-500">Ep</span>
              <Input
                type="number"
                min={minEp}
                max={maxEp}
                value={startEp}
                onChange={e => setStartEp(Math.max(minEp, Math.min(maxEp, parseInt(e.target.value) || minEp)))}
                className="w-16 h-8 text-xs bg-white/[0.04] border-white/[0.08] text-center"
              />
              <span className="text-[11px] text-zinc-500">to</span>
              <Input
                type="number"
                min={minEp}
                max={maxEp}
                value={endEp}
                onChange={e => setEndEp(Math.max(minEp, Math.min(maxEp, parseInt(e.target.value) || maxEp)))}
                className="w-16 h-8 text-xs bg-white/[0.04] border-white/[0.08] text-center"
              />
            </div>
          )}

          <Badge variant="outline" className="border-white/[0.1] text-[10px] shrink-0">
            {selectedEpisodes.length} selected
          </Badge>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              if (selectedEpisodes.length > MAX_BATCH_SIZE && !isResolving) {
                toast.warning(
                  `Resolving ${selectedEpisodes.length} episodes will make ~${selectedEpisodes.length * 2} API calls over ~${Math.round(selectedEpisodes.length * RESOLVE_DELAY_MS / 1000 / 60)} min`,
                  { description: 'Consider using a smaller range to avoid overloading the server', duration: 5000 }
                );
              }
              resolveStreams();
            }}
            disabled={isResolving || selectedEpisodes.length === 0}
            size="sm"
            className="bg-fox-orange hover:bg-fox-orange/90 text-white h-8 text-xs flex-1"
          >
            {isResolving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Resolving... ({resolvedCount}/{selectedEpisodes.length})
              </>
            ) : (
              <>
                <FileDown className="w-3.5 h-3.5 mr-1.5" />
                Resolve Streams ({selectedEpisodes.length} eps)
              </>
            )}
          </Button>

          {resolvedCount > 0 && (
            <>
              {directCount > 0 && (
                <Button
                  onClick={downloadAll}
                  disabled={isDownloading || directCount === 0}
                  size="sm"
                  variant="outline"
                  className="border-green-500/30 text-green-400 hover:bg-green-500/10 h-8 text-xs"
                >
                  {isDownloading ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  DL All ({directCount})
                </Button>
              )}
              <Button
                onClick={copyAllUrls}
                size="sm"
                variant="outline"
                className="border-white/[0.1] text-zinc-400 hover:text-white h-8 text-xs"
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copy URLs
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Size Estimation */}
      {downloadStates.size > 0 && (
        <div className="px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.01]">
          <div className="flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <HardDrive className="w-3.5 h-3.5" />
              <span>Est. Total Size:</span>
              <span className="text-white font-semibold">{formatBytes(totalEstimatedSize)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Package className="w-3.5 h-3.5" />
              <span>{resolvedCount} resolved</span>
            </div>
            {errorCount > 0 && (
              <div className="flex items-center gap-1.5 text-red-400">
                <XCircle className="w-3.5 h-3.5" />
                <span>{errorCount} failed</span>
              </div>
            )}
            {doneCount > 0 && (
              <div className="flex items-center gap-1.5 text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{doneCount} done</span>
              </div>
            )}
            {m3u8Count > 0 && (
              <div className="flex items-center gap-1 text-amber-400">
                <AlertCircle className="w-3 h-3" />
                <span className="text-[10px]">{m3u8Count} HLS (use external downloader)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Episode Download List */}
      {downloadStates.size > 0 && (
        <div className="max-h-[300px] overflow-y-auto overscroll-contain">
          <div className="divide-y divide-white/[0.03]">
            {[...downloadStates.values()]
              .sort((a, b) => a.episodeNum - b.episodeNum)
              .map(state => (
                <div
                  key={state.episodeId}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-white/[0.02] transition-colors"
                >
                  {/* Status Icon */}
                  <div className="w-5 h-5 flex items-center justify-center shrink-0">
                    {state.status === 'pending' && (
                      <div className="w-2 h-2 rounded-full bg-zinc-600" />
                    )}
                    {state.status === 'resolving' && (
                      <Loader2 className="w-4 h-4 text-fox-orange animate-spin" />
                    )}
                    {state.status === 'ready' && (
                      <CheckCircle2 className="w-4 h-4 text-blue-400" />
                    )}
                    {state.status === 'downloading' && (
                      <Loader2 className="w-4 h-4 text-green-400 animate-spin" />
                    )}
                    {state.status === 'done' && (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    )}
                    {state.status === 'error' && (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>

                  {/* Episode Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-white">
                        Ep {state.episodeNum}
                      </span>
                      <span className="text-[11px] text-zinc-500 truncate">
                        {state.title}
                      </span>
                    </div>
                    {state.status === 'downloading' && state.progress !== undefined && (
                      <Progress value={state.progress} className="h-1 mt-1" />
                    )}
                    {state.error && (
                      <p className="text-[10px] text-red-400 truncate mt-0.5">{state.error}</p>
                    )}
                  </div>

                  {/* Size */}
                  {state.fileSize ? (
                    <span className="text-[10px] text-zinc-500 shrink-0">
                      {formatBytes(state.fileSize)}
                    </span>
                  ) : null}

                  {/* Stream type badge */}
                  {state.streamUrl && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] px-1.5 py-0 shrink-0",
                        state.isM3U8
                          ? "border-amber-500/30 text-amber-400"
                          : "border-green-500/30 text-green-400"
                      )}
                    >
                      {state.isM3U8 ? 'HLS' : 'MP4'}
                    </Badge>
                  )}

                  {/* Action button */}
                  {state.status === 'ready' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadSingle(state.episodeId)}
                      className="h-6 w-6 p-0 text-zinc-400 hover:text-white"
                      title={state.isM3U8 ? 'Open stream' : 'Download'}
                    >
                      {state.isM3U8 ? (
                        <ExternalLink className="w-3.5 h-3.5" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {downloadStates.size === 0 && (
        <div className="px-4 py-6 text-center">
          <FileDown className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-xs text-zinc-500">
            Select an episode range and click "Resolve Streams" to find download links.
          </p>
          <p className="text-[10px] text-zinc-600 mt-1">
            Direct MP4 streams can be downloaded. HLS streams require an external downloader.
          </p>
        </div>
      )}
    </div>
  );
}
