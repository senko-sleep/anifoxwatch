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
}

export const SectionHeader = ({
    title,
    subtitle,
    link,
    linkText = "See All",
    className
}: SectionHeaderProps) => {
    return (
        <div className={cn("flex items-baseline justify-between mb-3 sm:mb-5", className)}>
            <div>
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-white leading-none">{title}</h2>
                {subtitle && (
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">{subtitle}</p>
                )}
            </div>

            {link && (
                <Link
                    to={link}
                    className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-fox-orange transition-colors flex items-center gap-1 shrink-0 touch-manipulation py-1"
                >
                    {linkText}
                    <ChevronRight className="w-4 h-4" />
                </Link>
            )}
        </div>
    );
};
