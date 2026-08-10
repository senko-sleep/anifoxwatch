# AniWatch API Documentation

## Overview

A complete anime streaming API built with Cloudflare Workers, providing search, details, episodes, and streaming sources for anime content.

**Base URL:** `https://aniwatch-api.anifoxwatch.workers.dev`  
**API Version:** `2.18.2`  
**Environment:** `cloudflare-workers`

## Features

- ✅ Anime search and discovery
- ✅ Detailed anime information 
- ✅ Episode listings and metadata
- ✅ Multiple streaming sources
- ✅ Genre and category filtering
- ✅ Release schedules
- ✅ Browser-compatible CORS
- ✅ Cached responses for performance

## Quick Start

### Common Endpoints

| Endpoint | Description | Method |
|----------|-------------|--------|
| `/api/home` | Get homepage with trending anime | GET |
| `/api/search?q=naruto` | Search for anime by title | GET |
| `/api/category/most-popular` | Get most popular anime | GET |
| `/health` | Check API health status | GET |

### Example Usage

```bash
# Get trending anime
curl "https://aniwatch-api.anifoxwatch.workers.dev/api/home"

# Search for anime
curl "https://aniwatch-api.anifoxwatch.workers.dev/api/search?q=naruto"

# Get anime details
curl "https://aniwatch-api.anifoxwatch.workers.dev/api/anime/naruto-123"

# Get streaming sources
curl "https://aniwatch-api.anifoxwatch.workers.dev/api/episode/sources?animeEpisodeId=naruto-ep-1"
```

## System Endpoints

### Health Check
- **Endpoint:** `/health`
- **Method:** `GET`
- **Description:** API health check with status and version info
- **Response:** `daijoubu` (Japanese for "I'm fine")

```bash
curl "https://aniwatch-api.anifoxwatch.workers.dev/health"
# Response: daijoubu
```

### Documentation
- **Endpoint:** `/help`
- **Method:** `GET`
- **Description:** Comprehensive API documentation (this page)

### Version Info
- **Endpoint:** `/v`
- **Method:** `GET`
- **Description:** API version information

```bash
curl "https://aniwatch-api.anifoxwatch.workers.dev/v"
# Response: aniwatch-api: v2.18.2
#          environment: cloudflare-workers
```

## Core API Endpoints

### Homepage
- **Endpoint:** `/api/home`
- **Method:** `GET`
- **Description:** Homepage with trending and latest anime
- **Response:**
```json
{
  "status": 200,
  "data": {
    "trendingAnimes": [...],
    "latestEpisodes": [...],
    "spotlight": {...}
  }
}
```

### Search
- **Endpoint:** `/api/search`
- **Method:** `GET`
- **Description:** Search anime by title
- **Parameters:**
  - `q` (required): Search query
  - `page` (optional): Page number (default: 1)
  - `type` (optional): Anime type filter
  - `genre` (optional): Genre filter
  - `year` (optional): Year filter
  - `status` (optional): Status filter
  - `sort` (optional): Sort order

**Example:**
```bash
curl "https://aniwatch-api.anifoxwatch.workers.dev/api/search?q=naruto&page=1"
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "animes": [...],
    "currentPage": 1,
    "hasNextPage": true,
    "totalPages": 10,
    "totalResults": 95
  }
}
```

### Categories

#### Most Popular
- **Endpoint:** `/api/category/most-popular`
- **Method:** `GET`
- **Description:** Most popular anime

#### By Category Name
- **Endpoint:** `/api/category/{name}`
- **Method:** `GET`
- **Description:** Anime by category
- **Parameters:**
  - `name`: Category name (action, adventure, comedy, etc.)
  - `page`: Page number (default: 1)

### Genre
- **Endpoint:** `/api/genre/{name}`
- **Method:** `GET`
- **Description:** Anime by genre
- **Parameters:**
  - `name`: Genre name (action, adventure, comedy, etc.)
  - `page`: Page number (default: 1)

### Producer
- **Endpoint:** `/api/producer/{name}`
- **Method:** `GET`
- **Description:** Anime by producer
- **Parameters:**
  - `name`: Producer name
  - `page`: Page number (default: 1)

### Schedule
- **Endpoint:** `/api/schedule`
- **Method:** `GET`
- **Description:** Anime release schedule
- **Parameters:**
  - `date`: Date (YYYY-MM-DD format)
  - `tzOffset`: Timezone offset in minutes

### A-Z List
- **Endpoint:** `/api/azlist/{sortOption}`
- **Method:** `GET`
- **Description:** Anime A-Z list
- **Parameters:**
  - `sortOption`: Sort option (#az, #za, #rating)
  - `page`: Page number (default: 1)

### Quick Tip Info
- **Endpoint:** `/api/qtip/{animeId}`
- **Method:** `GET`
- **Description:** Quick tip info for anime
- **Parameters:**
  - `animeId`: Anime ID

## Anime Details

### Anime Information
- **Endpoint:** `/api/anime/{id}`
- **Method:** `GET`
- **Description:** Detailed anime information
- **Parameters:**
  - `id`: Anime ID

**Example:**
```bash
curl "https://aniwatch-api.anifoxwatch.workers.dev/api/anime/naruto-123"
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "id": "naruto-123",
    "name": "Naruto",
    "japaneseName": "ナルト",
    "type": "TV",
    "episodes": {
      "sub": 220,
      "dub": 220
    },
    "status": "Completed",
    "year": 2002,
    "season": "Fall 2002",
    "rating": 8.5,
    "genres": ["Action", "Adventure", "Martial Arts"],
    "otherNames": ["Naruto Uzumaki"],
    "synopsis": "A young ninja...",
    "image": "https://...",
    "trailer": "https://..."
  }
}
```

### Episodes
- **Endpoint:** `/api/anime/{id}/episodes`
- **Method:** `GET`
- **Description:** List of episodes for an anime
- **Parameters:**
  - `id`: Anime ID

**Response:**
```json
{
  "status": 200,
  "data": {
    "totalEpisodes": 220,
    "episodes": [
      {
        "id": "naruto-ep-1",
        "number": 1,
        "title": "Enter: Naruto Uzumaki!",
        "description": "The episode description...",
        "image": "https://...",
        "releaseDate": "2002-10-03"
      }
    ]
  }
}
```

### Next Episode Schedule
- **Endpoint:** `/api/anime/{id}/next-episode-schedule`
- **Method:** `GET`
- **Description:** Next episode release schedule
- **Parameters:**
  - `id`: Anime ID

## Streaming

### Episode Servers
- **Endpoint:** `/api/episode/servers`
- **Method:** `GET`
- **Description:** Available streaming servers for an episode
- **Parameters:**
  - `animeEpisodeId`: Episode ID (required)

**Example:**
```bash
curl "https://aniwatch-api.anifoxwatch.workers.dev/api/episode/servers?animeEpisodeId=naruto-ep-1"
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "servers": [
      {
        "name": "vidstreaming",
        "url": "https://...",
        "type": "sub"
      },
      {
        "name": "streamsb",
        "url": "https://...",
        "type": "sub"
      }
    ]
  }
}
```

### Streaming Sources
- **Endpoint:** `/api/episode/sources`
- **Method:** `GET`
- **Description:** Streaming sources for an episode
- **Parameters:**
  - `animeEpisodeId`: Episode ID (required)
  - `server`: Streaming server (default: vidstreaming)
  - `category`: Category (sub, dub, raw)

**Example:**
```bash
curl "https://aniwatch-api.anifoxwatch.workers.dev/api/episode/sources?animeEpisodeId=naruto-ep-1&server=vidstreaming&category=sub"
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "sources": [
      {
        "url": "https://...",
        "quality": "1080p",
        "isM3U8": true,
        "isDASH": false
      },
      {
        "url": "https://...",
        "quality": "720p",
        "isM3U8": false,
        "isDASH": false
      }
    ],
    "subtitles": [
      {
        "url": "https://...",
        "lang": "en",
        "label": "English"
      }
    ],
    "headers": {
      "Referer": "https://...",
      "User-Agent": "..."
    },
    "intro": {
      "start": 90,
      "end": 150
    },
    "outro": {
      "start": 1420,
      "end": 1480
    }
  }
}
```

## Proxy Endpoints (Frontend Compatibility)

These endpoints proxy to the core API endpoints for frontend compatibility:

### Trending
- **Endpoint:** `/api/anime/trending`
- **Method:** `GET`
- **Description:** Trending anime (proxy to `/api/home`)
- **Parameters:**
  - `page`: Page number
  - `source`: Data source filter
  - `limit`: Result limit

### Latest
- **Endpoint:** `/api/anime/latest`
- **Method:** `GET`
- **Description:** Latest episodes (proxy to `/api/home`)
- **Parameters:**
  - `page`: Page number
  - `source`: Data source filter

### Top Rated
- **Endpoint:** `/api/anime/top-rated`
- **Method:** `GET`
- **Description:** Top rated anime (proxy to `/api/category/most-popular`)
- **Parameters:**
  - `page`: Page number
  - `limit`: Result limit
  - `source`: Data source filter

### Search
- **Endpoint:** `/api/anime/search`
- **Method:** `GET`
- **Description:** Anime search (proxy to `/api/search`)
- **Parameters:**
  - `q`: Search query
  - `page`: Page number
  - `source`: Data source filter

### Genre
- **Endpoint:** `/api/anime/genre/{genre}`
- **Method:** `GET`
- **Description:** Anime by genre (proxy to `/api/genre/{genre}`)
- **Parameters:**
  - `genre`: Genre name
  - `page`: Page number

### Anime Details
- **Endpoint:** `/api/anime/{id}`
- **Method:** `GET`
- **Description:** Anime details (proxy to `/api/anime/{id}`)
- **Parameters:**
  - `id`: Anime ID

### Episodes
- **Endpoint:** `/api/anime/{id}/episodes`
- **Method:** `GET`
- **Description:** Anime episodes (proxy to `/api/anime/{id}/episodes`)
- **Parameters:**
  - `id`: Anime ID

### Episode Servers
- **Endpoint:** `/api/episode/servers`
- **Method:** `GET`
- **Description:** Episode servers (proxy to `/api/episode/servers`)
- **Parameters:**
  - `animeEpisodeId`: Episode ID

### Episode Sources
- **Endpoint:** `/api/episode/sources`
- **Method:** `GET`
- **Description:** Episode sources (proxy to `/api/episode/sources`)
- **Parameters:**
  - `animeEpisodeId`: Episode ID
  - `server`: Streaming server
  - `category`: Category (sub, dub, raw)

## Response Format

All API responses follow this structure:

```json
{
  "status": 200,
  "data": "Response data or error message"
}
```

### Error Responses

```json
{
  "status": 404,
  "data": "Anime not found"
}
```

```json
{
  "status": 400,
  "data": "Invalid request parameters"
}
```

## Rate Limiting

- **Enabled:** Yes
- **Window:** 30 minutes
- **Max Requests:** 1000 per window per IP

## Caching

- **Cache Duration:** 5 minutes (300 seconds)
- **Stale While Revalidate:** 60 seconds
- **Cache Headers:** `Cache-Control`, `ETag`

## CORS Configuration

The API supports CORS for browser applications:

**Allowed Origins:**
- `http://localhost:3000`
- `http://localhost:3001`
- `http://localhost:4000`
- `http://localhost:5173`
- `http://localhost:8080-8083`
- `http://127.0.0.1:8080-8083`
- `*` (fallback)

**Allowed Methods:**
- `GET`, `POST`, `OPTIONS`

**Max Age:** 600 seconds (10 minutes)

## Error Handling

### Common HTTP Status Codes

| Status | Description |
|--------|-------------|
| 200 | Success |
| 400 | Bad Request |
| 404 | Not Found |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

### Error Response Format

```json
{
  "status": 404,
  "data": "Anime not found"
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
class AniWatchAPI {
  private baseUrl = 'https://aniwatch-api.anifoxwatch.workers.dev';

  async search(query: string, page = 1) {
    const response = await fetch(`${this.baseUrl}/api/search?q=${query}&page=${page}`);
    return response.json();
  }

  async getAnimeDetails(id: string) {
    const response = await fetch(`${this.baseUrl}/api/anime/${id}`);
    return response.json();
  }

  async getStreamingSources(episodeId: string, server = 'vidstreaming', category = 'sub') {
    const params = new URLSearchParams({
      animeEpisodeId: episodeId,
      server,
      category
    });
    const response = await fetch(`${this.baseUrl}/api/episode/sources?${params}`);
    return response.json();
  }
}

// Usage
const api = new AniWatchAPI();
const searchResults = await api.search('naruto');
const animeDetails = await api.getAnimeDetails('naruto-123');
const streamingSources = await api.getStreamingSources('naruto-ep-1');
```

### Python

```python
import requests

class AniWatchAPI:
    def __init__(self):
        self.base_url = 'https://aniwatch-api.anifoxwatch.workers.dev'
    
    def search(self, query, page=1):
        response = requests.get(f'{self.base_url}/api/search', params={'q': query, 'page': page})
        return response.json()
    
    def get_anime_details(self, anime_id):
        response = requests.get(f'{self.base_url}/api/anime/{anime_id}')
        return response.json()
    
    def get_streaming_sources(self, episode_id, server='vidstreaming', category='sub'):
        params = {
            'animeEpisodeId': episode_id,
            'server': server,
            'category': category
        }
        response = requests.get(f'{self.base_url}/api/episode/sources', params=params)
        return response.json()

# Usage
api = AniWatchAPI()
search_results = api.search('naruto')
anime_details = api.get_anime_details('naruto-123')
streaming_sources = api.get_streaming_sources('naruto-ep-1')
```

## Support

- **API Documentation:** `https://aniwatch-api.anifoxwatch.workers.dev/help`
- **Health Check:** `https://aniwatch-api.anifoxwatch.workers.dev/health`
- **Version Info:** `https://aniwatch-api.anifoxwatch.workers.dev/v`

## License

This API is provided for educational and development purposes. Please respect the terms of service of the original anime providers.
