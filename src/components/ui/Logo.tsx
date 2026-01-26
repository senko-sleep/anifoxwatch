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
          viewBox="0 0 40 40"
          className={cn(
            'fill-current',
            size === 'sm' && 'w-7 h-7',
            size === 'md' && 'w-9 h-9',
            size === 'lg' && 'w-12 h-12'
          )}
        >
          {/* Fox head shape */}
          <path
            d="M20 4L8 16L4 32L20 38L36 32L32 16L20 4Z"
            className="fill-fox-orange"
          />
          {/* Left ear */}
          <path
            d="M8 16L4 4L14 12L8 16Z"
            className="fill-fox-orange-light"
          />
          {/* Right ear */}
          <path
            d="M32 16L36 4L26 12L32 16Z"
            className="fill-fox-orange-light"
          />
          {/* Face details */}
          <ellipse cx="14" cy="20" rx="3" ry="4" className="fill-background" />
          <ellipse cx="26" cy="20" rx="3" ry="4" className="fill-background" />
          <ellipse cx="14" cy="20" rx="1.5" ry="2" className="fill-foreground" />
          <ellipse cx="26" cy="20" rx="1.5" ry="2" className="fill-foreground" />
          {/* Nose */}
          <path d="M20 26L17 30L20 32L23 30L20 26Z" className="fill-fox-darker" />
        </svg>
      </div>
      <span className={cn('font-bold tracking-tight', sizes[size])}>
        <span className="text-gradient-orange">Ani</span>
        <span className="text-foreground">Fox</span>
      </span>
    </div>
  );
};
