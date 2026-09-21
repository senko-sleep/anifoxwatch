import type { ReactNode } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { animePathForSlug, watchPathForSlug } from '@/lib/routes';

/**
 * Adult titles now live under `/hentai/…` and `/watch/hentai/…`. Links made
 * before that — `/anime/<slug>?mode=adult`, `/watch/anime/<slug>?mode=adult&ep=2`
 * — still turn up in bookmarks and history, so hand them to the new address
 * (replacing the entry, so Back doesn't bounce through the old one).
 *
 * Anything without `mode=adult` renders normally.
 */
export const AdultRouteRedirect = ({
  kind,
  children,
}: {
  kind: 'title' | 'watch';
  children: ReactNode;
}) => {
  const { animeId = '' } = useParams<{ animeId: string }>();
  const [searchParams] = useSearchParams();

  if (searchParams.get('mode') !== 'adult' || !animeId) return <>{children}</>;

  const rest = new URLSearchParams(searchParams);
  rest.delete('mode');

  if (kind === 'watch') {
    const ep = parseInt(rest.get('ep') || '', 10);
    rest.delete('ep');
    return (
      <Navigate
        to={watchPathForSlug(animeId, Number.isFinite(ep) && ep > 0 ? ep : null, rest.toString(), null, true)}
        replace
      />
    );
  }

  return <Navigate to={animePathForSlug(animeId, rest.toString() ? `?${rest.toString()}` : '', true)} replace />;
};
