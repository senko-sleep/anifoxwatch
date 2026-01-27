import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Mic, 
  Subtitles, 
  Monitor, 
  Server, 
  Zap,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EpisodeServer {
  name: string;
  url: string;
  type: 'sub' | 'dub' | 'raw';
}

type AudioType = 'sub' | 'dub';
type QualityType = '1080p' | '720p' | '480p' | '360p' | 'auto';

interface StreamingControlsProps {
  audioType: AudioType;
  onAudioTypeChange: (type: AudioType) => void;
  quality: QualityType;
  onQualityChange: (quality: QualityType) => void;
  availableQualities: string[];
  servers: EpisodeServer[];
  selectedServer: string;
  onServerChange: (server: string) => void;
  serversLoading?: boolean;
  autoPlay: boolean;
  onAutoPlayChange: (autoPlay: boolean) => void;
  currentSource?: string;
  hasDub?: boolean;
  hasSub?: boolean;
}

const qualityLabels: Record<QualityType, string> = {
  '1080p': '1080p (Full HD)',
  '720p': '720p (HD)',
  '480p': '480p (SD)',
  '360p': '360p',
  'auto': 'Auto'
};

export function StreamingControls({
  audioType,
  onAudioTypeChange,
  quality,
  onQualityChange,
  availableQualities,
  servers,
  selectedServer,
  onServerChange,
  serversLoading = false,
  autoPlay,
  onAutoPlayChange,
  currentSource,
  hasDub = false,
  hasSub = true
}: StreamingControlsProps) {
  // Get unique qualities
  const qualities: QualityType[] = ['auto', '1080p', '720p', '480p', '360p'].filter(q => 
    q === 'auto' || availableQualities.includes(q)
  ) as QualityType[];

  // Group servers by type
  const subServers = servers.filter(s => s.type === 'sub');
  const dubServers = servers.filter(s => s.type === 'dub');

  const isSubAvailable = hasSub || subServers.length > 0;
  const isDubAvailable = hasDub || dubServers.length > 0;

  const visibleServers = (audioType === 'dub' ? dubServers : subServers).length
    ? (audioType === 'dub' ? dubServers : subServers)
    : servers;

  return (
    <div className="p-4 bg-fox-surface/30 rounded-xl space-y-4">
      {/* Audio Type Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Audio</span>
        </div>
        
        <div className="flex items-center gap-1 p-1 bg-background/50 rounded-lg">
          <Button
            variant={audioType === 'sub' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onAudioTypeChange('sub')}
            disabled={!isSubAvailable}
            className={cn(
              "gap-2 h-8",
              audioType === 'sub' && "bg-fox-orange hover:bg-fox-orange/90"
            )}
          >
            <Subtitles className="w-4 h-4" />
            SUB
          </Button>
          
          <Button
            variant={audioType === 'dub' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onAudioTypeChange('dub')}
            disabled={!isDubAvailable}
            className={cn(
              "gap-2 h-8",
              audioType === 'dub' && "bg-green-600 hover:bg-green-600/90",
              !isDubAvailable && "opacity-50"
            )}
          >
            <Mic className="w-4 h-4" />
            DUB
            {hasDub && (
              <CheckCircle2 className="w-3 h-3 ml-1 text-green-300" />
            )}
          </Button>
        </div>
      </div>

      {/* Quality Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Quality</span>
        </div>
        
        <Select value={quality} onValueChange={(v) => onQualityChange(v as QualityType)}>
          <SelectTrigger className="w-40 bg-background/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {qualities.map(q => (
              <SelectItem key={q} value={q}>
                <div className="flex items-center gap-2">
                  {q === '1080p' && <Badge className="bg-fox-orange text-xs px-1">HD</Badge>}
                  {qualityLabels[q]}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Server Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Server</span>
        </div>
        
        {serversLoading ? (
          <Skeleton className="w-40 h-10" />
        ) : (
          <Select value={selectedServer} onValueChange={onServerChange}>
            <SelectTrigger className="w-44 bg-background/50">
              <SelectValue placeholder="Select server" />
            </SelectTrigger>
            <SelectContent>
              {visibleServers.map(server => (
                <SelectItem key={`${server.type}-${server.name}`} value={server.name}>
                  <div className="flex items-center gap-2">
                    {selectedServer === server.name && (
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                    )}
                    {server.name}
                  </div>
                </SelectItem>
              ))}
              {visibleServers.length === 0 && (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4 mx-auto mb-1" />
                  No servers available
                </div>
              )}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Auto Play Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-muted-foreground" />
          <Label htmlFor="autoplay" className="text-sm font-medium cursor-pointer">
            Auto-play next episode
          </Label>
        </div>
        
        <Switch
          id="autoplay"
          checked={autoPlay}
          onCheckedChange={onAutoPlayChange}
        />
      </div>

      {/* Current Source Info */}
      {currentSource && (
        <div className="pt-2 border-t border-border/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Streaming from</span>
            <Badge variant="outline" className="text-xs">
              {currentSource}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}
