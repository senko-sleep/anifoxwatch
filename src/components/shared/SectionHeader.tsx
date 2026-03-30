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
    /** Softer typography for secondary rails (e.g. browse rows below a hero). */
    variant?: 'default' | 'quiet';
}

export const SectionHeader = ({
    title,
    subtitle,
    link,
    linkText = "See All",
    className,
    variant = 'default',
}: SectionHeaderProps) => {
    const quiet = variant === 'quiet';
    return (
        <div className={cn("flex items-baseline justify-between gap-4 mb-3 sm:mb-4", className)}>
            <div className="min-w-0">
                <h2
                    className={cn(
                        "font-display tracking-tight leading-tight",
                        quiet
                            ? "text-[15px] sm:text-base font-semibold text-zinc-200"
                            : "text-base sm:text-lg font-semibold text-white"
                    )}
                >
                    {title}
                </h2>
                {subtitle && (
                    <p className={cn("mt-0.5 text-[11px] sm:text-xs text-zinc-500")}>
                        {subtitle}
                    </p>
                )}
            </div>

            {link && (
                <Link
                    to={link}
                    className="text-xs font-medium text-zinc-500 hover:text-fox-orange transition-colors flex items-center gap-0.5 shrink-0 touch-manipulation"
                >
                    {linkText}
                    <ChevronRight className="w-3.5 h-3.5" />
                </Link>
            )}
        </div>
    );
};
