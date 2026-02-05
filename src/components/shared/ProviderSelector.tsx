import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Globe, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

// All available anime sources organized by priority/type
export const ALL_PROVIDERS = {
  primary: [
    { id: 'HiAnimeDirect', name: 'HiAnime', description: 'Primary source, best quality' },
    { id: 'HiAnime', name: 'HiAnime API', description: 'Backup HiAnime' },
  ],
  highPriority: [
    { id: 'Zoro', name: 'Zoro/Aniwatch', description: 'High quality sub/dub' },
    { id: 'AnimePahe', name: 'AnimePahe', description: 'Low bandwidth, good quality' },
    { id: 'AnimeSuge', name: 'AnimeSuge', description: 'Fast servers' },
    { id: 'Kaido', name: 'Kaido', description: 'Similar to Zoro' },
    { id: 'Anix', name: 'Anix', description: 'Alternative source' },
  ],
  standard: [
    { id: 'Gogoanime', name: 'Gogoanime', description: 'Classic, reliable' },
    { id: '9Anime', name: '9Anime', description: 'Large library' },
    { id: 'Aniwave', name: 'Aniwave', description: 'Good quality' },
    { id: 'KickassAnime', name: 'KickassAnime', description: 'Fast updates' },
    { id: 'YugenAnime', name: 'YugenAnime', description: 'Clean interface' },
    { id: 'AniMixPlay', name: 'AniMixPlay', description: 'Multi-source' },
  ],
  regional: [
    { id: 'AnimeFLV', name: 'AnimeFLV', description: 'Spanish/Latino' },
    { id: 'AnimeSaturn', name: 'AnimeSaturn', description: 'Italian' },
    { id: 'Crunchyroll', name: 'Crunchyroll', description: 'Official (limited)' },
  ],
  backup: [
    { id: 'AnimeFox', name: 'AnimeFox', description: 'Backup source' },
    { id: 'AnimeDAO', name: 'AnimeDAO', description: 'Alternative' },
    { id: 'AnimeOnsen', name: 'AnimeOnsen', description: 'Backup' },
    { id: 'Marin', name: 'Marin', description: 'Community source' },
    { id: 'AnimeHeaven', name: 'AnimeHeaven', description: 'Legacy source' },
    { id: 'AnimeKisa', name: 'AnimeKisa', description: 'Alternative' },
    { id: 'AnimeOwl', name: 'AnimeOwl', description: 'Backup' },
    { id: 'AnimeLand', name: 'AnimeLand', description: 'Dubbed anime' },
    { id: 'AnimeFreak', name: 'AnimeFreak', description: 'Backup source' },
  ],
  aggregator: [
    { id: 'Consumet', name: 'Consumet', description: 'Multi-provider API' },
  ],
  adult: [
    { id: 'WatchHentai', name: 'WatchHentai', description: 'Adult content only' },
  ]
};

// Flat list of all providers
export const ALL_PROVIDERS_FLAT = [
  ...ALL_PROVIDERS.primary,
  ...ALL_PROVIDERS.highPriority,
  ...ALL_PROVIDERS.standard,
  ...ALL_PROVIDERS.regional,
  ...ALL_PROVIDERS.backup,
  ...ALL_PROVIDERS.aggregator,
];

interface ProviderHealth {
  name: string;
  status: 'online' | 'offline' | 'degraded';
  latency?: number;
}

interface ProviderSelectorProps {
  selectedProvider: string;
  onProviderChange: (provider: string) => void;
  showHealthStatus?: boolean;
  compact?: boolean;
  excludeAdult?: boolean;
  className?: string;
}

export function ProviderSelector({
  selectedProvider,
  onProviderChange,
  showHealthStatus = false,
  compact = false,
  excludeAdult = true,
  className
}: ProviderSelectorProps) {
  const [healthStatus, setHealthStatus] = useState<Record<string, ProviderHealth>>({});
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);

  // Fetch health status
  const fetchHealthStatus = async () => {
    setIsLoadingHealth(true);
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiBase}/api/sources/health`);
      const data = await response.json();
      const statusMap: Record<string, ProviderHealth> = {};
      (data.sources || []).forEach((s: ProviderHealth) => {
        statusMap[s.name] = s;
      });
      setHealthStatus(statusMap);
    } catch (error) {
      console.error('Failed to fetch provider health:', error);
    } finally {
      setIsLoadingHealth(false);
    }
  };

  useEffect(() => {
    if (showHealthStatus) {
      fetchHealthStatus();
    }
  }, [showHealthStatus]);

  const getStatusIcon = (providerId: string) => {
    const status = healthStatus[providerId];
    if (!status) return null;
    
    if (status.status === 'online') {
      return <CheckCircle2 className="w-3 h-3 text-green-500" />;
    } else if (status.status === 'degraded') {
      return <AlertCircle className="w-3 h-3 text-yellow-500" />;
    }
    return <AlertCircle className="w-3 h-3 text-red-500" />;
  };

  const selectedProviderInfo = ALL_PROVIDERS_FLAT.find(p => p.id === selectedProvider);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Globe className="w-4 h-4 text-muted-foreground" />
        <Select value={selectedProvider} onValueChange={onProviderChange}>
          <SelectTrigger className="w-40 h-8 text-xs bg-background/50">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {ALL_PROVIDERS_FLAT.map(provider => (
              <SelectItem key={provider.id} value={provider.id} className="text-xs">
                <div className="flex items-center gap-2">
                  {showHealthStatus && getStatusIcon(provider.id)}
                  {provider.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Provider</span>
        </div>
        
        {showHealthStatus && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0"
                onClick={fetchHealthStatus}
                disabled={isLoadingHealth}
              >
                <RefreshCw className={cn("w-3 h-3", isLoadingHealth && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh health status</TooltipContent>
          </Tooltip>
        )}
      </div>

      <Select value={selectedProvider} onValueChange={onProviderChange}>
        <SelectTrigger className="w-full bg-background/50">
          <SelectValue>
            {selectedProviderInfo && (
              <div className="flex items-center gap-2">
                {showHealthStatus && getStatusIcon(selectedProvider)}
                <span>{selectedProviderInfo.name}</span>
                {selectedProvider === 'HiAnimeDirect' && (
                  <Badge className="bg-fox-orange text-xs px-1 py-0">
                    <Zap className="w-2 h-2 mr-1" />
                    Primary
                  </Badge>
                )}
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-96">
          <SelectGroup>
            <SelectLabel className="text-fox-orange">⭐ Primary Sources</SelectLabel>
            {ALL_PROVIDERS.primary.map(provider => (
              <SelectItem key={provider.id} value={provider.id}>
                <div className="flex items-center justify-between w-full gap-4">
                  <div className="flex items-center gap-2">
                    {showHealthStatus && getStatusIcon(provider.id)}
                    <span>{provider.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{provider.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>

          <SelectGroup>
            <SelectLabel className="text-green-500">🚀 High Priority</SelectLabel>
            {ALL_PROVIDERS.highPriority.map(provider => (
              <SelectItem key={provider.id} value={provider.id}>
                <div className="flex items-center justify-between w-full gap-4">
                  <div className="flex items-center gap-2">
                    {showHealthStatus && getStatusIcon(provider.id)}
                    <span>{provider.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{provider.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>

          <SelectGroup>
            <SelectLabel className="text-blue-500">📺 Standard Sources</SelectLabel>
            {ALL_PROVIDERS.standard.map(provider => (
              <SelectItem key={provider.id} value={provider.id}>
                <div className="flex items-center justify-between w-full gap-4">
                  <div className="flex items-center gap-2">
                    {showHealthStatus && getStatusIcon(provider.id)}
                    <span>{provider.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{provider.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>

          <SelectGroup>
            <SelectLabel className="text-purple-500">🌍 Regional</SelectLabel>
            {ALL_PROVIDERS.regional.map(provider => (
              <SelectItem key={provider.id} value={provider.id}>
                <div className="flex items-center justify-between w-full gap-4">
                  <div className="flex items-center gap-2">
                    {showHealthStatus && getStatusIcon(provider.id)}
                    <span>{provider.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{provider.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>

          <SelectGroup>
            <SelectLabel className="text-gray-500">💾 Backup Sources</SelectLabel>
            {ALL_PROVIDERS.backup.map(provider => (
              <SelectItem key={provider.id} value={provider.id}>
                <div className="flex items-center justify-between w-full gap-4">
                  <div className="flex items-center gap-2">
                    {showHealthStatus && getStatusIcon(provider.id)}
                    <span>{provider.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{provider.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>

          {!excludeAdult && (
            <SelectGroup>
              <SelectLabel className="text-red-500">🔞 Adult</SelectLabel>
              {ALL_PROVIDERS.adult.map(provider => (
                <SelectItem key={provider.id} value={provider.id}>
                  <div className="flex items-center justify-between w-full gap-4">
                    <div className="flex items-center gap-2">
                      {showHealthStatus && getStatusIcon(provider.id)}
                      <span>{provider.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{provider.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

      {selectedProviderInfo && (
        <p className="text-xs text-muted-foreground">
          {selectedProviderInfo.description}
        </p>
      )}
    </div>
  );
}

export default ProviderSelector;
