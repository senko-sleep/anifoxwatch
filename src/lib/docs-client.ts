import axios from 'axios';

export interface ApiEndpoint {
    [key: string]: string;
}

export interface ApiDocs {
    name: string;
    version: string;
    description: string;
    endpoints: {
        [category: string]: ApiEndpoint;
    };
    availableSources: string[];
}

export interface ApiHealth {
    status: string;
    timestamp: string;
    version: string;
    uptime: number;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class DocsClient {
    private cacheKey = 'anifox_api_docs_cache';
    private healthKey = 'anifox_api_health_cache';
    private prefsKey = 'anifox_api_docs_prefs';

    async getDocs(): Promise<ApiDocs> {
        try {
            const response = await axios.get(`${API_BASE}/api`);
            const data = response.data;
            localStorage.setItem(this.cacheKey, JSON.stringify({
                data,
                timestamp: Date.now()
            }));
            return data;
        } catch (error) {
            console.error('Failed to fetch API docs:', error);
            const cached = this.getCachedDocs();
            if (cached) return cached;
            throw error;
        }
    }

    async getHealth(): Promise<ApiHealth> {
        try {
            const response = await axios.get(`${API_BASE}/api/health`);
            const data = response.data;
            localStorage.setItem(this.healthKey, JSON.stringify({
                data,
                timestamp: Date.now()
            }));
            return data;
        } catch (error) {
            console.error('Failed to fetch API health:', error);
            const cached = this.getCachedHealth();
            if (cached) return cached;
            throw error;
        }
    }

    getCachedDocs(): ApiDocs | null {
        const cached = localStorage.getItem(this.cacheKey);
        if (!cached) return null;
        try {
            return JSON.parse(cached).data;
        } catch {
            return null;
        }
    }

    getCachedHealth(): ApiHealth | null {
        const cached = localStorage.getItem(this.healthKey);
        if (!cached) return null;
        try {
            return JSON.parse(cached).data;
        } catch {
            return null;
        }
    }

    savePrefs(prefs: { lastTab: 'guide' | 'reference', lastSection?: string }) {
        localStorage.setItem(this.prefsKey, JSON.stringify(prefs));
    }

    getPrefs(): { lastTab: 'guide' | 'reference', lastSection?: string } {
        const cached = localStorage.getItem(this.prefsKey);
        if (!cached) return { lastTab: 'guide' };
        try {
            return JSON.parse(cached);
        } catch {
            return { lastTab: 'guide' };
        }
    }
}

export const docsClient = new DocsClient();
