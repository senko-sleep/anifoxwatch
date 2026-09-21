import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Hides the wordmark — for tight bars where the mark alone must carry it. */
  markOnly?: boolean;
}

const MARK_SIZE = { sm: 'h-6 w-6', md: 'h-7 w-7', lg: 'h-10 w-10' };
const WORD_SIZE = { sm: 'text-lg', md: 'text-xl', lg: 'text-3xl' };

/**
 * A fox tail curled into a crescent — drawn as one ember-lit stroke rather
 * than the old multi-layer illustration, so it stays legible at 24px.
 */
export const Logo = ({ className, size = 'md', markOnly = false }: LogoProps) => (
  <span className={cn('inline-flex items-center gap-2.5', className)}>
    <svg viewBox="0 0 32 32" className={cn(MARK_SIZE[size], 'shrink-0')} aria-hidden>
      <defs>
        <linearGradient id="foxEmber" x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="hsl(38 96% 68%)" />
          <stop offset="100%" stopColor="hsl(20 88% 54%)" />
        </linearGradient>
      </defs>
      {/* Tail sweep */}
      <path
        d="M26 5c-7.4.6-12.9 4-15.6 9.4C7.7 19.7 9.2 25 14 27"
        fill="none"
        stroke="url(#foxEmber)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      {/* Lit tip */}
      <circle cx="26" cy="5" r="2.6" fill="hsl(40 100% 86%)" />
      {/* Ember at rest */}
      <circle cx="14" cy="27" r="2" fill="hsl(24 88% 56%)" opacity="0.85" />
    </svg>

    {!markOnly && (
      <span className={cn('font-display font-semibold tracking-tight', WORD_SIZE[size])}>
        <span className="text-gradient-ember">Ani</span>
        <span className="text-foreground">Fox</span>
      </span>
    )}
  </span>
);
