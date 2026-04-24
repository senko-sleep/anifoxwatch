import { ChevronRight, LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
    title: string;
    subtitle?: string;
    icon?: LucideIcon;
    iconColor?: string;
    iconBg?: string;
    link?: string;
    linkText?: string;
    className?: string;
    variant?: 'default' | 'quiet';
}

export const SectionHeader = ({
    title,
    subtitle,
    link,
    linkText = 'See All',
    className,
    variant = 'default',
}: SectionHeaderProps) => {
    const quiet = variant === 'quiet';
    return (
        <div className={cn('flex items-center justify-between gap-4 mb-2 sm:mb-3 lg:mb-4', className)}>
            <div className="flex items-center gap-2.5 min-w-0">
                {/* Left accent bar */}
                {!quiet && (
                    <span className="shrink-0 w-[3px] h-5 rounded-full bg-fox-orange shadow-[0_0_6px_1px] shadow-fox-orange/50" />
                )}
                <div className="min-w-0">
                    <h2
                        className={cn(
                            'font-display tracking-tight leading-tight',
                            quiet
                                ? 'text-[15px] sm:text-base font-semibold text-zinc-300'
                                : 'text-[14px] sm:text-lg font-bold text-white'
                        )}
                    >
                        {title}
                    </h2>
                    {subtitle && (
                        <p className="mt-0.5 text-[11px] sm:text-xs text-zinc-500">{subtitle}</p>
                    )}
                </div>
            </div>

            {link && (
                <Link
                    to={link}
                    className="shrink-0 flex items-center gap-0.5 text-[11px] sm:text-xs font-semibold text-zinc-500 hover:text-fox-orange transition-colors touch-manipulation"
                >
                    {linkText}
                    <ChevronRight className="w-3.5 h-3.5" />
                </Link>
            )}
        </div>
    );
};
