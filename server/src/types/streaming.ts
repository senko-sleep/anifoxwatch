/**
 * Streaming-related types for video sources
 */

export interface VideoSource {
    url: string;
    quality: '360p' | '480p' | '720p' | '1080p' | 'auto' | 'default';
    isM3U8: boolean;
    isDASH?: boolean;
    size?: number;
}

export interface VideoSubtitle {
    url: string;
    lang: string;
    label?: string;
}

export interface StreamingData {
    sources: VideoSource[];
    subtitles: VideoSubtitle[];
    headers?: Record<string, string>;
    intro?: { start: number; end: number };
    outro?: { start: number; end: number };
    download?: string;
    source?: string;
}

export interface EpisodeServer {
    name: string;
    url: string;
    type: 'sub' | 'dub' | 'raw';
}

export interface StreamingProvider {
    name: string;
    baseUrl: string;
    priority: number;
    supportsSubtitles: boolean;
    supportsDub: boolean;
}

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}
