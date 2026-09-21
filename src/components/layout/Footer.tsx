import { Link } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';

/**
 * The footer is where a streaming site usually turns into a link farm. This
 * one states what the place is, credits its data, and offers the handful of
 * routes people actually use — nothing it can't stand behind.
 */
const COLUMNS: { heading: string; links: { to: string; label: string }[] }[] = [
  {
    heading: 'Watch',
    links: [
      { to: '/browse', label: 'Browse everything' },
      { to: '/browse?status=Ongoing', label: 'Airing this season' },
      { to: '/browse?type=Movie', label: 'Films' },
      { to: '/schedule', label: 'Airing schedule' },
    ],
  },
  {
    heading: 'Explore',
    links: [
      { to: '/browse?genres=Action', label: 'Action' },
      { to: '/browse?genres=Romance', label: 'Romance' },
      { to: '/browse?genres=Slice%20of%20Life', label: 'Slice of Life' },
      { to: '/browse?sort=popularity', label: 'All-time favourites' },
    ],
  },
  {
    heading: 'Behind the scenes',
    links: [
      { to: '/status', label: 'Source status' },
      { to: '/health', label: 'Service health' },
      { to: '/docs', label: 'API documentation' },
    ],
  },
];

export const Footer = () => (
  <footer className="mt-16 border-t border-white/[0.06]">
    <div className="page-x py-12 sm:py-16">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-sm">
          <Logo size="md" />
          <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
            A quiet place to find something to watch. Listings, artwork and scores come from{' '}
            <a
              href="https://anilist.co"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/80 underline decoration-white/20 underline-offset-4 transition-colors hover:text-[hsl(var(--primary))]"
            >
              AniList
            </a>
            ; playback comes from whichever source is healthiest at the time.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.heading}>
            <h3 className="eyebrow">{col.heading}</h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="hairline mt-12" />

      <div className="mt-6 flex flex-col gap-2 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} AniFox — made for people who rewatch things.</p>
        <p>All titles belong to their respective creators and licensors.</p>
      </div>
    </div>
  </footer>
);
