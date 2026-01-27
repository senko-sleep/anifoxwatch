import { useState, useMemo } from 'react';
import { Episode, Anime } from '@/types/anime';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, 
  Play, 
  ChevronDown, 
  ChevronUp,
  Mic,
  Subtitles,
  Filter
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface EpisodeListProps {
  episodes: Episode[];
  selectedEpisodeId: string | null;
  onEpisodeSelect: (episodeId: string, episodeNum: number) => void;
  isLoading?: boolean;
  anime?: Anime | null;
}

type SortOrder = 'asc' | 'desc';

export function EpisodeList({
  episodes,
  selectedEpisodeId,
  onEpisodeSelect,
  isLoading = false,
  anime
}: EpisodeListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [showFillers, setShowFillers] = useState(true);

  // Group episodes by season (every 12-26 episodes typically)
  const seasons = useMemo(() => {
    if (!episodes.length) return [];
    
    const episodesPerSeason = 12;
    const seasonCount = Math.ceil(episodes.length / episodesPerSeason);
    
    return Array.from({ length: seasonCount }, (_, i) => ({
      id: `season-${i + 1}`,
      name: `Season ${i + 1}`,
      startEp: i * episodesPerSeason + 1,
      endEp: Math.min((i + 1) * episodesPerSeason, episodes.length)
    }));
  }, [episodes]);

  // Filter and sort episodes
  const filteredEpisodes = useMemo(() => {
    let result = [...episodes];

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(ep => 
        ep.title.toLowerCase().includes(query) ||
        ep.number.toString().includes(query)
      );
    }

    // Filter by season
    if (selectedSeason !== 'all') {
      const season = seasons.find(s => s.id === selectedSeason);
      if (season) {
        result = result.filter(ep => 
          ep.number >= season.startEp && ep.number <= season.endEp
        );
      }
    }

    // Filter fillers
    if (!showFillers) {
      result = result.filter(ep => !ep.isFiller);
    }

    // Sort
    result.sort((a, b) => 
      sortOrder === 'asc' ? a.number - b.number : b.number - a.number
    );

    return result;
  }, [episodes, searchQuery, selectedSeason, showFillers, sortOrder, seasons]);

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-fox-surface/30 rounded-xl p-4 space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-fox-surface/30 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/30">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-lg">Episodes</h3>
          <Badge variant="secondary">
            {episodes.length} eps
          </Badge>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search episodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-background/50"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {seasons.length > 1 && (
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="flex-1 bg-background/50">
                <SelectValue placeholder="All Seasons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Seasons</SelectItem>
                {seasons.map(season => (
                  <SelectItem key={season.id} value={season.id}>
                    {season.name} ({season.startEp}-{season.endEp})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="outline"
            size="icon"
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="bg-background/50"
          >
            {sortOrder === 'asc' ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>

          <Button
            variant={showFillers ? 'outline' : 'secondary'}
            size="icon"
            onClick={() => setShowFillers(prev => !prev)}
            className="bg-background/50"
            title={showFillers ? 'Hide fillers' : 'Show fillers'}
          >
            <Filter className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Episode List */}
      <ScrollArea className="h-[500px]">
        <div className="p-2 space-y-1">
          {filteredEpisodes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No episodes found
            </div>
          ) : (
            filteredEpisodes.map(episode => (
              <button
                key={episode.id}
                onClick={() => onEpisodeSelect(episode.id, episode.number)}
                className={cn(
                  "w-full p-3 rounded-lg text-left transition-all",
                  "hover:bg-fox-orange/10 group",
                  selectedEpisodeId === episode.id 
                    ? "bg-fox-orange/20 border border-fox-orange/50" 
                    : "bg-background/30"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Episode number */}
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                    "bg-fox-surface text-sm font-medium",
                    selectedEpisodeId === episode.id && "bg-fox-orange text-white"
                  )}>
                    {selectedEpisodeId === episode.id ? (
                      <Play className="w-4 h-4" fill="currentColor" />
                    ) : (
                      episode.number
                    )}
                  </div>

                  {/* Episode info */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-medium text-sm truncate",
                      selectedEpisodeId === episode.id && "text-fox-orange"
                    )}>
                      {episode.title !== `Episode ${episode.number}` 
                        ? episode.title 
                        : `Episode ${episode.number}`
                      }
                    </p>
                    
                    <div className="flex items-center gap-2 mt-1">
                      {episode.hasSub && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Subtitles className="w-3 h-3" />
                          SUB
                        </span>
                      )}
                      {episode.hasDub && (
                        <span className="flex items-center gap-1 text-xs text-green-500">
                          <Mic className="w-3 h-3" />
                          DUB
                        </span>
                      )}
                      {episode.isFiller && (
                        <Badge variant="outline" className="text-xs px-1 py-0 text-yellow-500 border-yellow-500/50">
                          Filler
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Quick stats */}
      {anime && (
        <div className="p-3 border-t border-border/30 bg-background/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {anime.subCount || episodes.length} Sub
            </span>
            <span>•</span>
            <span className={anime.dubCount ? 'text-green-500' : ''}>
              {anime.dubCount || 0} Dub
            </span>
            <span>•</span>
            <span>
              {anime.status}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
