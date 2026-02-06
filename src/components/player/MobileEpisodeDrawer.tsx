import { useState } from 'react';
import { Episode, Anime } from '@/types/anime';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { EpisodeList } from './EpisodeList';
import { List, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileEpisodeDrawerProps {
  episodes: Episode[];
  selectedEpisodeId: string | null;
  onEpisodeSelect: (episodeId: string, episodeNum: number) => void;
  isLoading?: boolean;
  anime?: Anime | null;
  currentEpisodeNum?: number;
}

export function MobileEpisodeDrawer({
  episodes,
  selectedEpisodeId,
  onEpisodeSelect,
  isLoading = false,
  anime,
  currentEpisodeNum
}: MobileEpisodeDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleEpisodeSelect = (episodeId: string, episodeNum: number) => {
    onEpisodeSelect(episodeId, episodeNum);
    setIsOpen(false); // Close drawer after selection
  };

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full gap-2 border-white/10 hover:bg-white/5 h-12 text-base",
            "touch-manipulation" // Better touch response
          )}
        >
          <List className="w-5 h-5" />
          <span>
            Episodes
            {currentEpisodeNum && (
              <span className="ml-1 text-fox-orange font-semibold">
                ({currentEpisodeNum}/{episodes.length})
              </span>
            )}
          </span>
          <Badge variant="secondary" className="ml-auto">
            {episodes.length}
          </Badge>
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DrawerTitle>Episodes</DrawerTitle>
              <DrawerDescription className="line-clamp-1">
                {anime?.title || 'Select an episode to watch'}
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <X className="w-5 h-5" />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>
        
        <div className="px-4 pb-4 overflow-hidden">
          <EpisodeList
            episodes={episodes}
            selectedEpisodeId={selectedEpisodeId}
            onEpisodeSelect={handleEpisodeSelect}
            isLoading={isLoading}
            anime={anime}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
