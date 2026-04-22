import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { X, Users, Loader2 } from 'lucide-react';
import { IMDBClient, IMDBActor } from '@/lib/imdb-client';
import { cn } from '@/lib/utils';

interface VoiceActorModalProps {
  isOpen: boolean;
  onClose: () => void;
  animeTitle: string;
}

export const VoiceActorModal = ({ isOpen, onClose, animeTitle }: VoiceActorModalProps) => {
  const [actors, setActors] = useState<IMDBActor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && animeTitle) {
      fetchCast();
    }
  }, [isOpen, animeTitle]);

  const fetchCast = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await IMDBClient.getAnimeCast(animeTitle);
      setActors(response.actors);
    } catch (err) {
      setError('Failed to load voice actors');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-black/90 backdrop-blur-xl border border-white/[0.08] text-white max-w-2xl max-h-[80vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-fox-orange" />
            <DialogTitle className="text-lg font-bold">Voice Actors</DialogTitle>
            <span className="text-sm text-zinc-500">{animeTitle}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-white/[0.1] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        <div className="py-4 overflow-y-auto max-h-[60vh]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-fox-orange animate-spin mb-4" />
              <p className="text-sm text-zinc-400">Loading voice actors...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-zinc-700 mb-4" />
              <p className="text-sm text-zinc-400">{error}</p>
              <p className="text-xs text-zinc-600 mt-2">Voice actor data coming soon</p>
            </div>
          ) : actors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-zinc-700 mb-4" />
              <p className="text-sm text-zinc-400">No voice actor data available</p>
              <p className="text-xs text-zinc-600 mt-2">IMDB integration coming soon</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {actors.map((actor) => (
                <div
                  key={actor.id}
                  className="flex flex-col items-center text-center p-3 rounded-lg bg-white/[0.03] border border-white/[0.05] hover:border-fox-orange/30 transition-colors"
                >
                  {actor.image ? (
                    <img
                      src={actor.image}
                      alt={actor.name}
                      className="w-16 h-16 rounded-full object-cover mb-2 ring-2 ring-white/[0.1]"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-2">
                      <Users className="w-8 h-8 text-zinc-600" />
                    </div>
                  )}
                  <p className="text-xs font-semibold text-white line-clamp-1">{actor.name}</p>
                  {actor.character && (
                    <p className="text-[10px] text-zinc-500 line-clamp-1">as {actor.character}</p>
                  )}
                  {actor.role && (
                    <p className="text-[10px] text-fox-orange mt-1">{actor.role}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
