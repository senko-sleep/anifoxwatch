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
      <div className="p-3 border-b border-border/30">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-base">Episodes</h3>
          <Badge variant="secondary" className="text-xs">
            {episodes.length} eps
          </Badge>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search episodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 bg-background/50 h-8 text-sm"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-1.5">
          {seasons.length > 1 && (
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="flex-1 bg-background/50 h-8 text-sm">
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
            className="bg-background/50 h-8 w-8"
          >
            {sortOrder === 'asc' ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </Button>

          <Button
            variant={showFillers ? 'outline' : 'secondary'}
            size="icon"
            onClick={() => setShowFillers(prev => !prev)}
            className="bg-background/50 h-8 w-8"
            title={showFillers ? 'Hide fillers' : 'Show fillers'}
          >
            <Filter className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Episode List */}
      <ScrollArea className="h-[500px]">
        <div className="p-1.5 space-y-1">
          {filteredEpisodes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No episodes found
            </div>
          ) : (
            filteredEpisodes.map(episode => (
              <button
                key={episode.id}
                onClick={() => onEpisodeSelect(episode.id, episode.number)}
                className={cn(
                  "w-full p-2 rounded-lg text-left transition-all",
                  "hover:bg-fox-orange/10 group",
                  selectedEpisodeId === episode.id 
                    ? "bg-fox-orange/20 border border-fox-orange/50" 
                    : "bg-background/30"
                )}
              >
                <div className="flex items-start gap-2">
                  {/* Episode number */}
                  <div className={cn(
                    "w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-xs",
                    "bg-fox-surface font-medium",
                    selectedEpisodeId === episode.id && "bg-fox-orange text-white"
                  )}>
                    {selectedEpisodeId === episode.id ? (
                      <Play className="w-3 h-3 fill-current" />
                    ) : (
                      episode.number
                    )}
                  </div>

                  {/* Episode info */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-medium text-xs leading-tight",
                      selectedEpisodeId === episode.id && "text-fox-orange",
                      "line-clamp-2" // Allow up to 2 lines for longer titles
                    )}>
                      {episode.title !== `Episode ${episode.number}` 
                        ? episode.title 
                        : `Episode ${episode.number}`
                      }
                    </p>
                    
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {episode.hasSub && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
                          <Subtitles className="w-2 h-2 flex-shrink-0" />
                          SUB
                        </span>
                      )}
                      {episode.hasDub && (
                        <span className="flex items-center gap-0.5 text-[10px] text-green-500 whitespace-nowrap">
                          <Mic className="w-2 h-2 flex-shrink-0" />
                          DUB
                        </span>
                      )}
                      {episode.isFiller && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 text-yellow-500 border-yellow-500/50 whitespace-nowrap">
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
      <div className="p-2.5 border-t border-border/30 bg-background/30">
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Subtitles className="w-3 h-3" />
            <span>{episodes.filter(e => e.hasSub).length || anime?.subCount || episodes.length} Sub</span>
          </div>
          <span className="text-muted-foreground/40">•</span>
          {(() => {
            const dubEpCount = episodes.filter(e => e.hasDub).length;
            const dubCount = dubEpCount || anime?.dubCount || 0;
            const hasDub = dubCount > 0;
            return (
              <div className={cn(
                "flex items-center gap-1",
                hasDub ? "text-green-500" : "text-zinc-600"
              )}>
                <Mic className="w-3 h-3" />
                {hasDub ? (
                  <span>{dubCount} Dub</span>
                ) : (
                  <span>No Dub</span>
                )}
              </div>
            );
          })()}
          <span className="text-muted-foreground/40">•</span>
          {anime && (
            <span className={cn(
              "text-[10px] font-medium",
              anime.status === 'Ongoing' ? "text-green-500" :
                anime.status === 'Completed' ? "text-blue-400" : "text-purple-400"
            )}>
              {anime.status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
