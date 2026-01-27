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
          viewBox="0 0 32 32"
          className={cn(
            'drop-shadow-md',
            size === 'sm' && 'w-7 h-7',
            size === 'md' && 'w-9 h-9',
            size === 'lg' && 'w-12 h-12'
          )}
        >
          <defs>
            <linearGradient id="logoTailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff8c42" />
              <stop offset="50%" stopColor="#ff6b35" />
              <stop offset="100%" stopColor="#e85d04" />
            </linearGradient>
            <linearGradient id="logoTipGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f8f8f8" />
            </linearGradient>
          </defs>

          {/* Main fluffy tail body */}
          <path
            d="M8 26 C4 22 2 16 4 10 C6 6 10 4 14 5 C18 6 20 4 24 3 C28 2 30 6 29 10 C28 14 26 18 22 22 C18 26 12 28 8 26 Z"
            fill="url(#logoTailGrad)"
          />

          {/* White tip of tail */}
          <path
            d="M24 3 C28 2 30 5 29 8 C28 10 26 11 24 10 C22 9 22 6 24 3 Z"
            fill="url(#logoTipGrad)"
          />

          {/* Fur texture lines */}
          <path d="M10 20 Q14 18 18 19" stroke="#d35400" strokeWidth="1.2" fill="none" opacity="0.4" strokeLinecap="round" />
          <path d="M8 16 Q12 14 16 15" stroke="#d35400" strokeWidth="1.2" fill="none" opacity="0.3" strokeLinecap="round" />

          {/* Highlight on tail */}
          <path d="M14 8 Q18 7 22 8" stroke="#ffb380" strokeWidth="1.5" fill="none" opacity="0.5" strokeLinecap="round" />
        </svg>
      </div>
      <span className={cn('font-bold tracking-tight', sizes[size])}>
        <span className="text-gradient-orange">Ani</span>
        <span className="text-foreground">Fox</span>
      </span>
    </div>
  );
};
