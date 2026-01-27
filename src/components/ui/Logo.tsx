import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Logo = ({ className, size = 'md' }: LogoProps) => {
  const sizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative">
        <svg
          viewBox="0 0 50 50"
          className={cn(
            'fill-current drop-shadow-md',
            size === 'sm' && 'w-8 h-8',
            size === 'md' && 'w-10 h-10',
            size === 'lg' && 'w-14 h-14'
          )}
        >
          <defs>
            <linearGradient id="tailGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" className="stop-color-fox-orange" style={{ stopColor: 'hsl(var(--fox-orange))' }} />
              <stop offset="100%" className="stop-color-fox-orange-dark" style={{ stopColor: 'hsl(var(--fox-orange-dark))' }} />
            </linearGradient>
          </defs>

          {/* Main fluffy tail shape */}
          <path
            d="M37.5 10c-3-2-7-2-10 0-4 2.5-5 6-5 6s-4-1-6 2c-3 4-1 9 1 11 1.5 1.5 4 2 4 2s-1 3 1 5c2 2 6 3 9 2 5-1.5 8-6 8-6s3-4 3-8c0-5-2-12-5-14z"
            fill="url(#tailGradient)"
            className="drop-shadow-sm"
          />

          {/* White tip of the tail - fluffy edges */}
          <path
            d="M37.5 10c-1.5-1-3.5-1-5 0-1.5 1-2 2-2 3 0 0 1 2 2 3s3 1 4 0c1-1 2-3 2-3s0-2-1-3z"
            className="fill-white"
            opacity="0.9"
          />

          {/* Subtle fluff details/highlights */}
          <path
            d="M26 22c0 0 2-1 4-1s3 1 3 1"
            className="fill-none stroke-white/20 stroke-2"
            strokeLinecap="round"
          />
          <path
            d="M24 26c0 0 2-1 4 0"
            className="fill-none stroke-white/20 stroke-2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className={cn('font-bold tracking-tight', sizes[size])}>
        <span className="text-gradient-orange">Ani</span>
        <span className="text-foreground">Fox</span>
      </span>
    </div>
  );
};
