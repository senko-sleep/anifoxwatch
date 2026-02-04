export const API_DOCS_MARKDOWN = `
# AniWatch API Documentation

## Overview

A complete anime streaming API built with Cloudflare Workers, providing search, details, episodes, and streaming sources for anime content.

**Base URL:** \`https://anifoxwatch-api.anifoxwatch.workers.dev\`  
**API Version:** \`2.18.2\`  
**Environment:** \`cloudflare-workers\`

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
| \`/api/home\` | Get homepage with trending anime | GET |
| \`/api/search?q=naruto\` | Search for anime by title | GET |
| \`/api/category/most-popular\` | Get most popular anime | GET |
| \`/health\` | Check API health status | GET |

### Example Usage

\`\`\`bash
# Get trending anime
curl "https://anifoxwatch-api.anifoxwatch.workers.dev/api/home"

# Search for anime
curl "https://anifoxwatch-api.anifoxwatch.workers.dev/api/search?q=naruto"

# Get anime details
curl "https://anifoxwatch-api.anifoxwatch.workers.dev/api/anime/naruto-123"

# Get streaming sources
curl "https://anifoxwatch-api.anifoxwatch.workers.dev/api/episode/sources?animeEpisodeId=naruto-ep-1"
\`\`\`

## System Endpoints

### Health Check
- **Endpoint:** \`/health\`
- **Method:** \`GET\`
- **Description:** API health check with status and version info
- **Response:** \`daijoubu\` (Japanese for "I'm fine")

\`\`\`bash
curl "https://anifoxwatch-api.anifoxwatch.workers.dev/health"
# Response: daijoubu
\`\`\`

### Documentation
- **Endpoint:** \`/help\`
- **Method:** \`GET\`
- **Description:** Comprehensive API documentation (this page)

### Version Info
- **Endpoint:** \`/v\`
- **Method:** \`GET\`
- **Description:** API version information

\`\`\`bash
curl "https://anifoxwatch-api.anifoxwatch.workers.dev/v"
# Response: aniwatch-api: v2.18.2
#          environment: cloudflare-workers
\`\`\`

## Core API Endpoints

### Homepage
- **Endpoint:** \`/api/home\`
- **Method:** \`GET\`
- **Description:** Homepage with trending and latest anime
- **Response:**
\`\`\`json
{
  "status": 200,
  "data": {
    "trendingAnimes": [...],
    "latestEpisodes": [...],
    "spotlight": {...}
  }
}
\`\`\`

### Search
- **Endpoint:** \`/api/search\`
- **Method:** \`GET\`
- **Description:** Search anime by title
- **Parameters:**
  - \`q\` (required): Search query
  - \`page\` (optional): Page number (default: 1)
  - \`type\` (optional): Anime type filter
  - \`genre\` (optional): Genre filter
  - \`year\` (optional): Year filter
  - \`status\` (optional): Status filter
  - \`sort\` (optional): Sort order

**Example:**
\`\`\`bash
curl "https://anifoxwatch-api.anifoxwatch.workers.dev/api/search?q=naruto&page=1"
\`\`\`

**Response:**
\`\`\`json
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
\`\`\`

### Categories

#### Most Popular
- **Endpoint:** \`/api/category/most-popular\`
- **Method:** \`GET\`
- **Description:** Most popular anime

#### By Category Name
- **Endpoint:** \`/api/category/{name}\`
- **Method:** \`GET\`
- **Description:** Anime by category
- **Parameters:**
  - \`name\`: Category name (action, adventure, comedy, etc.)
  - \`page\`: Page number (default: 1)

### Genre
- **Endpoint:** \`/api/genre/{name}\`
- **Method:** \`GET\`
- \`Description:\` Anime by genre
- **Parameters:**
  - \`name\`: Genre name (action, adventure, comedy, etc.)
  - \`page\`: Page number (default: 1)

### Producer
- **Endpoint:** \`/api/producer/{name}\`
- **Method:** \`GET\`
- **Description:** Anime by producer
- **Parameters:**
  - \`name\`: Producer name
  - \`page\`: Page number (default: 1)

### Schedule
- **Endpoint:** \`/api/schedule\`
- **Method:** \`GET\`
- **Description:** Anime release schedule
- **Parameters:**
  - \`date\`: Date (YYYY-MM-DD format)
  - \`tzOffset\`: Timezone offset in minutes

### A-Z List
- **Endpoint:** \`/api/azlist/{sortOption}\`
- **Method:** \`GET\`
- **Description:** Anime A-Z list
- **Parameters:**
  - \`sortOption\`: Sort option (#az, #za, #rating)
  - \`page\`: Page number (default: 1)

### Quick Tip Info
- **Endpoint:** \`/api/qtip/{animeId}\`
- **Method:** \`GET\`
- **Description:** Quick tip info for anime
- **Parameters:**
  - \`animeId\`: Anime ID

## Anime Details

### Anime Information
- **Endpoint:** \`/api/anime/{id}\`
- **Method:** \`GET\`
- **Description:** Detailed anime information
- **Parameters:**
  - \`id\`: Anime ID

**Example:**
\`\`\`bash
curl "https://anifoxwatch-api.anifoxwatch.workers.dev/api/anime/naruto-123"
\`\`\`

**Response:**
\`\`\`json
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
\`\`\`

### Episodes
- **Endpoint:** \`/api/anime/{id}/episodes\`
- **Method:** \`GET\`
- **Description:** List of episodes for an anime
- **Parameters:**
  - \`id\`: Anime ID

**Response:**
\`\`\`json
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
\`\`\`

### Next Episode Schedule
- **Endpoint:** \`/api/anime/{id}/next-episode-schedule\`
- **Method:** \`GET\`
- **Description:** Next episode release schedule
- **Parameters:**
  - \`id\`: Anime ID

## Streaming

### Episode Servers
- **Endpoint:** \`/api/episode/servers\`
- **Method:** \`GET\`
- **Description:** Available streaming servers for an episode
- **Parameters:**
  - \`animeEpisodeId\`: Episode ID (required)

**Example:**
\`\`\`bash
curl "https://anifoxwatch-api.anifoxwatch.workers.dev/api/episode/servers?animeEpisodeId=naruto-ep-1"
\`\`\`

**Response:**
\`\`\`json
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
\`\`\`

### Streaming Sources
- **Endpoint:** \`/api/episode/sources\`
- **Method:** \`GET\`
- **Description:** Streaming sources for an episode
- **Parameters:**
  - \`animeEpisodeId\`: Episode ID (required)
  - \`server\`: Streaming server (default: vidstreaming)
  - \`category\`: Category (sub, dub, raw)

**Example:**
\`\`\`bash
curl "https://anifoxwatch-api.anifoxwatch.workers.dev/api/episode/sources?animeEpisodeId=naruto-ep-1&server=vidstreaming&category=sub"
\`\`\`

**Response:**
\`\`\`json
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
\`\`\`

## Proxy Endpoints (Frontend Compatibility)

These endpoints proxy to the core API endpoints for frontend compatibility:

### Trending
- **Endpoint:** \`/api/anime/trending\`
- **Method:** \`GET\`
- **Description:** Trending anime (proxy to \`/api/home\`)

### Latest
- **Endpoint:** \`/api/anime/latest\`
- **Method:** \`GET\`
- **Description:** Latest episodes (proxy to \`/api/home\`)

### Top Rated
- **Endpoint:** \`/api/anime/top-rated\`
- **Method:** \`GET\`
- **Description:** Top rated anime (proxy to \`/api/category/most-popular\`)

### Search
- **Endpoint:** \`/api/anime/search\`
- **Method:** \`GET\`
- **Description:** Anime search (proxy to \`/api/search\`)

### Genre
- **Endpoint:** \`/api/anime/genre/{genre}\`
- **Method:** \`GET\`
- **Description:** Anime by genre (proxy to \`/api/genre/{genre}\`)

### Anime Details
- **Endpoint:** \`/api/anime/{id}\`
- **Method:** \`GET\`
- **Description:** Anime details (proxy to \`/api/anime/{id}\`)

### Episodes
- **Endpoint:** \`/api/anime/{id}/episodes\`
- **Method:** \`GET\`
- **Description:** Anime episodes (proxy to \`/api/anime/{id}/episodes\`)

### Episode Servers
- **Endpoint:** \`/api/episode/servers\`
- **Method:** \`GET\`
- **Description:** Episode servers (proxy to \`/api/episode/servers\`)

### Episode Sources
- **Endpoint:** \`/api/episode/sources\`
- **Method:** \`GET\`
- **Description:** Episode sources (proxy to \`/api/episode/sources\`)

## Response Format

All API responses follow this structure:

\`\`\`json
{
  "status": 200,
  "data": "Response data or error message"
}
\`\`\`

### Rate Limiting

- **Enabled:** Yes
- **Window:** 30 minutes
- **Max Requests:** 1000 per window per IP

## Support

- **API Documentation:** \`https://anifoxwatch-api.anifoxwatch.workers.dev/help\`
- **Health Check:** \`https://anifoxwatch-api.anifoxwatch.workers.dev/health\`
- **Version Info:** \`https://anifoxwatch-api.anifoxwatch.workers.dev/v\`

## License

This API is provided for educational and development purposes. Please respect the terms of service of the original anime providers.
`;
