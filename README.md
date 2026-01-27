# 🎬 AniStream Hub

A modern, high-performance anime streaming platform with multi-source support. Built with React + TypeScript frontend and Express API backend.

## ✨ Features

- **Multi-Source Streaming**: Aggregates content from multiple anime streaming providers
  - Aniwatch/HiAnime (Primary)
  - Gogoanime (Backup)
  - Consumet API (Multi-provider aggregator)
  - Jikan/MyAnimeList (Metadata)
  
- **Real-time Video Streaming**: HLS/M3U8 streaming with multiple quality options
- **Sub & Dub Support**: Watch in your preferred language
- **Auto-Failover**: Automatically switches to backup sources if one fails
- **Fast & Responsive**: In-memory caching for instant load times
- **Modern UI**: Beautiful glassmorphism design with smooth animations

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/anistream-hub.git
cd anistream-hub

# Install all dependencies (frontend + backend)
npm run setup
```

### Development

```bash
# Start both frontend and API server
npm run dev:all

# Or start them separately:
npm run dev:api  # API server on http://localhost:3001
npm run dev      # Frontend on http://localhost:5173
```

### Production Build

```bash
# Build frontend
npm run build

# Build API server
cd server && npm run build
```

## 🏗️ Architecture

```
anistream-hub/
├── src/                    # Frontend (React + Vite)
│   ├── components/         # UI components
│   ├── hooks/              # React Query hooks
│   ├── lib/                # API client
│   ├── pages/              # Route pages
│   └── types/              # TypeScript types
│
└── server/                 # Backend (Express + TypeScript)
    ├── src/
    │   ├── routes/         # API endpoints
    │   ├── services/       # Source manager
    │   ├── sources/        # Streaming providers
    │   └── types/          # Shared types
    └── render.yaml         # Render.com deployment config
```

## 📡 API Endpoints

### Anime Data
| Endpoint | Description |
|----------|-------------|
| `GET /api/anime/search?q={query}` | Search anime |
| `GET /api/anime/trending` | Get trending anime |
| `GET /api/anime/latest` | Get latest episodes |
| `GET /api/anime/top-rated` | Get top rated anime |
| `GET /api/anime/:id` | Get anime details |
| `GET /api/anime/:id/episodes` | Get episode list |

### Streaming
| Endpoint | Description |
|----------|-------------|
| `GET /api/stream/servers/:episodeId` | Get available servers |
| `GET /api/stream/watch/:episodeId` | Get streaming URLs |
| `GET /api/stream/proxy?url={hlsUrl}` | Proxy HLS streams |

### Sources
| Endpoint | Description |
|----------|-------------|
| `GET /api/sources` | List all sources |
| `GET /api/sources/health` | Get source health status |

## 🌐 Deployment

### Render.com (Backend)

1. Create a new Web Service on Render
2. Connect your repository
3. Set build command: `cd server && npm install && npm run build`
4. Set start command: `cd server && npm start`
5. Add environment variables:
   - `PORT`: 3001
   - `CORS_ORIGIN`: Your frontend URL

### Vercel/Netlify (Frontend)

1. Connect your repository
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Add environment variable:
   - `VITE_API_URL`: Your API server URL

## 🔧 Environment Variables

### Frontend (.env)
```env
VITE_API_URL=http://localhost:3001/api
```

### Backend (server/.env)
```env
PORT=3001
NODE_ENV=development
CORS_ORIGIN=*
CONSUMET_API_URL=https://api.consumet.org
```

## 📦 Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite (build tool)
- TanStack React Query (data fetching)
- Tailwind CSS (styling)
- shadcn/ui (components)

**Backend:**
- Express.js
- TypeScript
- Axios (HTTP client)
- Multi-source architecture

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

## ⚠️ Disclaimer

This project is for educational purposes only. We do not host, store, or distribute any copyrighted content. All streaming sources are third-party providers.

## 📄 License

MIT License - see LICENSE file for details.
