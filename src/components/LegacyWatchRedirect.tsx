import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { parseEpisodeSegment, watchPathForSlug } from '@/lib/routes';

/**
 * Old links still arrive from bookmarks, history and search engines:
 *
 *   /watch?id=<slug>&ep=2          → /watch/anime/<slug>?ep=2
 *   /watch/<slug>/episode-2        → /watch/anime/<slug>?ep=2
 *   /watch/hentai/<slug>/episode-2 → /watch/hentai/<slug>?ep=2
 *
 * Each is rewritten to the canonical shape and `replace`d, so Back returns to
 * wherever the visitor actually came from instead of bouncing through the old URL.
 */
export const LegacyWatchRedirect = ({ adult = false }: { adult?: boolean }) => {
  const { slug: slugParam, episode } = useParams<{ slug?: string; episode?: string }>();
  const [searchParams] = useSearchParams();

  const slug = slugParam || searchParams.get('id') || '';
  if (!slug) return <Navigate to="/" replace />;

  // Episode can be the path segment (`episode-2`) or a query key from the oldest links.
  const queryEp = parseInt(searchParams.get('ep') || searchParams.get('episode') || '', 10);
  const episodeNum =
    parseEpisodeSegment(episode) ?? (Number.isFinite(queryEp) && queryEp > 0 ? queryEp : null);

  // `mode=adult` on an old link means the same as the /hentai/ path.
  const isAdult = adult || searchParams.get('mode') === 'adult';

  // Carry forward anything the player still understands; drop the rewritten keys.
  const rest = new URLSearchParams(searchParams);
  rest.delete('id');
  rest.delete('ep');
  rest.delete('episode');
  rest.delete('mode');

  return <Navigate to={watchPathForSlug(slug, episodeNum, rest.toString(), null, isAdult)} replace />;
};
