import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { useSchedule } from '@/hooks/useAnime';
import { ScheduleItem } from '@/lib/api-client';
import { Link } from 'react-router-dom';
import {
    ChevronLeft,
    ChevronRight,
    Bell,
    BellRing,
    Clock,
    Calendar,
    Loader2,
    AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Day of week mapping
const DAYS_OF_WEEK = [
    { key: 'monday', label: 'Mon', full: 'Monday' },
    { key: 'tuesday', label: 'Tue', full: 'Tuesday' },
    { key: 'wednesday', label: 'Wed', full: 'Wednesday' },
    { key: 'thursday', label: 'Thu', full: 'Thursday' },
    { key: 'friday', label: 'Fri', full: 'Friday' },
    { key: 'saturday', label: 'Sat', full: 'Saturday' },
    { key: 'sunday', label: 'Sun', full: 'Sunday' }
];

// Get current day key
function getCurrentDayKey(): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[new Date().getDay()];
}

// Format countdown time
function formatCountdown(seconds: number): string {
    if (seconds <= 0) return 'Now';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
        return `${days}d ${hours}h`;
    }
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

// Format air time
function formatAirTime(timestamp: number): string {
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(new Date(timestamp * 1000));
}

// Reminder storage key
const REMINDERS_STORAGE_KEY = 'anistream_reminders';

interface ReminderSettings {
    [showId: string]: number[]; // episode numbers
}

export const Schedule = () => {
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [selectedDay, setSelectedDay] = useState<string>(
        searchParams.get('day') || getCurrentDayKey()
    );
    const [reminders, setReminders] = useState<ReminderSettings>({});
    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

    // Load reminders from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(REMINDERS_STORAGE_KEY);
        if (stored) {
            try {
                setReminders(JSON.parse(stored));
            } catch {
                setReminders({});
            }
        }
    }, []);

    // Request notification permission
    useEffect(() => {
        if ('Notification' in window) {
            setNotificationPermission(Notification.permission);
        }
    }, []);

    // Check for upcoming episodes every minute
    useEffect(() => {
        const checkReminders = () => {
            const now = Date.now() / 1000;
            Object.entries(reminders).forEach(([showId, episodes]) => {
                episodes.forEach(episode => {
                    // This would need to be connected to actual schedule data
                    // For now, this is a placeholder for the notification logic
                });
            });
        };

        const interval = setInterval(checkReminders, 60000);
        return () => clearInterval(interval);
    }, [reminders]);

    // Fetch schedule data
    const { data: scheduleData, isLoading, error, refetch } = useSchedule();

    // Get anime for selected day
    const selectedDayAnime = useMemo(() => {
        if (!scheduleData?.groupedByDay) return [];
        return scheduleData.groupedByDay[selectedDay] || [];
    }, [scheduleData, selectedDay]);

    // Handle day navigation
    const handleDayChange = (day: string) => {
        setSelectedDay(day);
        setSearchParams({ day });
    };

    const goToPreviousDay = () => {
        const currentIndex = DAYS_OF_WEEK.findIndex(d => d.key === selectedDay);
        const previousIndex = currentIndex === 0 ? 6 : currentIndex - 1;
        handleDayChange(DAYS_OF_WEEK[previousIndex].key);
    };

    const goToNextDay = () => {
        const currentIndex = DAYS_OF_WEEK.findIndex(d => d.key === selectedDay);
        const nextIndex = currentIndex === 6 ? 0 : currentIndex + 1;
        handleDayChange(DAYS_OF_WEEK[nextIndex].key);
    };

    // Toggle reminder for an episode
    const toggleReminder = async (item: ScheduleItem, episode: number) => {
        if (notificationPermission === 'default') {
            const permission = await Notification.requestPermission();
            setNotificationPermission(permission);
        }

        if (notificationPermission === 'denied') {
            alert('Please enable notifications in your browser settings');
            return;
        }

        const showId = item.id.toString();
        const currentReminders = { ...reminders };
        const episodeReminders = currentReminders[showId] || [];

        if (episodeReminders.includes(episode)) {
            currentReminders[showId] = episodeReminders.filter(e => e !== episode);
        } else {
            currentReminders[showId] = [...episodeReminders, episode];
        }

        setReminders(currentReminders);
        localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(currentReminders));
    };

    return (
        <div className="min-h-screen bg-background text-foreground font-sans">
            <Navbar />

            <main className="container mx-auto px-4 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                        <Calendar className="w-8 h-8 text-fox-orange" />
                        Airing Schedule
                    </h1>
                    <p className="text-muted-foreground">
                        Discover what anime is airing each day of the week
                    </p>
                </div>

                {/* Day Navigation Tabs */}
                <div className="mb-8">
                    <div className="flex items-center gap-2">
                        {/* Previous Day Button */}
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={goToPreviousDay}
                            className="shrink-0"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>

                        {/* Day Tabs */}
                        <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
                            {DAYS_OF_WEEK.map((day) => (
                                <button
                                    key={day.key}
                                    onClick={() => handleDayChange(day.key)}
                                    className={cn(
                                        'px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                                        selectedDay === day.key
                                            ? 'bg-fox-orange text-white shadow-lg'
                                            : 'bg-fox-surface hover:bg-fox-surface/80 text-muted-foreground'
                                    )}
                                >
                                    {day.label}
                                </button>
                            ))}
                        </div>

                        {/* Next Day Button */}
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={goToNextDay}
                            className="shrink-0"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Content Area */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-fox-orange" />
                        <span className="ml-3 text-muted-foreground">Loading schedule...</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Failed to load schedule</h3>
                        <p className="text-muted-foreground mb-4">{error.message}</p>
                        <Button onClick={() => refetch()} variant="outline">
                            Try Again
                        </Button>
                    </div>
                ) : selectedDayAnime.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Calendar className="w-12 h-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No anime airing</h3>
                        <p className="text-muted-foreground">
                            No anime is scheduled to air on {DAYS_OF_WEEK.find(d => d.key === selectedDay)?.full}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Schedule List */}
                        {selectedDayAnime.map((item) => {
                            const hasReminder = reminders[item.id.toString()]?.includes(item.episode);

                            return (
                                <div
                                    key={item.id}
                                    className="flex items-center gap-4 p-4 bg-fox-surface rounded-xl hover:bg-fox-surface/80 transition-colors"
                                >
                                    {/* Thumbnail */}
                                    <Link
                                        to={`/watch?id=${encodeURIComponent(item.id)}`}
                                        state={{ from: location.pathname + location.search }}
                                        className="shrink-0 relative w-20 h-28 rounded-lg overflow-hidden"
                                    >
                                        <img
                                            src={item.media.thumbnail}
                                            alt={item.title}
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                                            <span className="text-xs text-white font-medium">
                                                EP {item.episode}
                                            </span>
                                        </div>
                                    </Link>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <Link
                                            to={`/watch?id=${encodeURIComponent(item.id)}`}
                                            state={{ from: location.pathname + location.search }}
                                            className="text-lg font-semibold hover:text-fox-orange transition-colors line-clamp-1"
                                        >
                                            {item.title}
                                        </Link>

                                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5" />
                                                {formatAirTime(item.airingAt)}
                                            </span>
                                            <span className="px-2 py-0.5 bg-fox-orange/20 text-fox-orange rounded text-xs">
                                                {item.media.format}
                                            </span>
                                        </div>

                                        {/* Genres */}
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {item.media.genres.slice(0, 3).map((genre) => (
                                                <span
                                                    key={genre}
                                                    className="px-2 py-0.5 bg-background rounded text-xs text-muted-foreground"
                                                >
                                                    {genre}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-col items-end gap-2">
                                        {/* Countdown */}
                                        <div className="text-right">
                                            <span className="text-xs text-muted-foreground">Airs in</span>
                                            <div className="text-lg font-bold text-fox-orange">
                                                {formatCountdown(item.airingAt - Date.now() / 1000)}
                                            </div>
                                        </div>

                                        {/* Reminder Button */}
                                        <Button
                                            variant={hasReminder ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => toggleReminder(item, item.episode)}
                                            className={cn(
                                                hasReminder && 'bg-fox-orange hover:bg-fox-orange/90'
                                            )}
                                        >
                                            {hasReminder ? (
                                                <BellRing className="w-4 h-4 mr-1" />
                                            ) : (
                                                <Bell className="w-4 h-4 mr-1" />
                                            )}
                                            {hasReminder ? 'Reminded' : 'Remind'}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
};

export default Schedule;
