import { ChevronRight, LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
    icon: Icon,
    iconColor = "text-white",
    iconBg = "from-fox-orange to-orange-600",
    link,
    linkText = "See All",
    className
}: SectionHeaderProps) => {
    return (
        <div className={cn("flex items-end justify-between mb-6", className)}>
            <div className="flex items-center gap-4">
                {Icon && (
                    <div className={cn(
                        "w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg",
                        iconBg // Use passed gradient classes
                    )}>
                        <Icon className={cn("w-5 h-5", iconColor)} />
                    </div>
                )}
                <div className="space-y-1">
                    <h2 className="text-2xl font-bold tracking-tight text-white leading-none">{title}</h2>
                    {subtitle && (
                        <p className="text-sm text-muted-foreground font-medium">{subtitle}</p>
                    )}
                </div>
            </div>

            {link && (
                <Link to={link}>
                    <Button variant="ghost" className="text-sm font-semibold text-muted-foreground hover:text-white hover:bg-white/5 gap-1 pr-2">
                        {linkText}
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </Link>
            )}
        </div>
    );
};
