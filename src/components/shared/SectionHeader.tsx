import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
    title: string;
    subtitle?: string;
    /** Where "see all" goes. Omit it and no link is drawn — no dead ends. */
    link?: string;
    linkText?: string;
    className?: string;
    variant?: 'default' | 'quiet';
}

/**
 * Row heading. The serif title carries the nostalgia; everything else stays
 * out of the way so the artwork below is the loudest thing on the shelf.
 */
export const SectionHeader = ({
    title,
    subtitle,
    link,
    linkText = 'See all',
    className,
    variant = 'default',
}: SectionHeaderProps) => {
    const quiet = variant === 'quiet';

    return (
        <div className={cn('mb-3 flex items-end justify-between gap-4 sm:mb-4', className)}>
            <div className="min-w-0">
                <h2
                    className={cn(
                        'section-title truncate',
                        quiet ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'
                    )}
                >
                    {title}
                </h2>
                {subtitle && (
                    <p className="mt-1 truncate text-xs text-muted-foreground sm:text-[13px]">{subtitle}</p>
                )}
            </div>

            {link && (
                <Link
                    to={link}
                    className="group/see shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:text-[13px]"
                >
                    {linkText}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 ease-glide group-hover/see:translate-x-0.5" />
                </Link>
            )}
        </div>
    );
};
