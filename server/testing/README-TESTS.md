# AniStream Hub - Comprehensive Test Suite

This directory contains comprehensive tests for all 28 anime streaming sources and application features.

## Test Files Created

### 1. **test-streaming-all-sources.ts**
Tests actual video stream extraction from all 28 sources:
- Searches for anime
- Fetches episodes
- Gets available servers
- Extracts streaming links (M3U8/MP4)
- Verifies stream URLs

### 2. **test-browser-filters.ts**
Tests browser/filter functionality:
- Search with queries
- Pagination
- Source filtering
- Trending/Latest/Top Rated endpoints
- Search-all sources
- Special character handling

### 3. **test-home-page-apis.ts**
Tests all home page endpoints:
- Trending anime
- Latest episodes
- Top rated
- Multi-source support
- API health checks

### 4. **test-all-sources.ts**
Basic health and functionality test for all sources:
- Health checks
- Search functionality
- Trending/Latest endpoints

### 5. **test-new-backup-sources.ts**
Specific tests for the 20 new backup sources:
- Site reachability
- API integration
- HTML scraping patterns

### 6. **test-html-scraping-patterns.ts**
Tests HTML parsing and extraction:
- Common CSS selectors
- Stream URL pattern matching
- M3U8/MP4 detection

### 7. **run-all-tests.ts**
Master test runner that executes all test suites and generates comprehensive report.

## How to Run Tests

### Prerequisites
Make sure your API server is running:
```bash
cd server
npm run dev
# or
npm start
```

### Run Individual Tests

```bash
cd server

# Test home page APIs
npx tsx testing/test-home-page-apis.ts

# Test browser filters
npx tsx testing/test-browser-filters.ts

# Test all sources health
npx tsx testing/test-all-sources.ts

# Test streaming from all sources (comprehensive, takes time)
npx tsx testing/test-streaming-all-sources.ts

# Test HTML scraping patterns
npx tsx testing/test-html-scraping-patterns.ts

# Test new backup sources specifically
npx tsx testing/test-new-backup-sources.ts
```

### Run All Tests at Once

```bash
cd server
npx tsx testing/run-all-tests.ts
```

This will:
- Run all test suites sequentially
- Generate individual JSON reports
- Create a master test report
- Display comprehensive statistics

## Test Results

After running tests, you'll find these result files:
- `home-page-test-results.json` - Home page API results
- `filter-test-results.json` - Filter/browser test results
- `test-results.json` - All sources health results
- `streaming-test-results.json` - Streaming verification results
- `scraping-test-results.json` - HTML scraping test results
- `master-test-report.json` - Aggregated results from all tests

## Expected Results

### All 28 Sources
1. **Primary**: HiAnimeDirect, HiAnime
2. **High Priority**: Zoro, AnimePahe, AnimeSuge, Kaido, Anix
3. **Standard**: Gogoanime, 9Anime, Aniwave, KickassAnime, YugenAnime, AniMixPlay
4. **Regional**: AnimeFLV, AnimeSaturn, Crunchyroll
5. **Backup**: AnimeFox, AnimeDAO, AnimeOnsen, Marin, AnimeHeaven, AnimeKisa, AnimeOwl, AnimeLand, AnimeFreak
6. **Aggregator**: Consumet
7. **Adult**: WatchHentai

### Success Criteria
- **Home Page**: At least 2/3 critical sections working
- **Filters**: 80%+ pass rate
- **Streaming**: 50%+ sources providing valid streams
- **Source Health**: 60%+ sources online

## Troubleshooting

### Tests Fail to Run
- Ensure API server is running on port 3001 (or set `API_URL` env var)
- Check network connectivity
- Some sources may be temporarily down (this is expected)

### Timeout Errors
- Individual tests have 15-30 second timeouts
- Some sources may be slow or rate-limited
- This is normal behavior for web scraping

### No Streaming Links
- Some sources require special headers/referers
- CORS issues may prevent direct URL verification
- Check if source website is accessible

## Notes

- Tests use real API calls to actual anime websites
- Some sources may be temporarily unavailable
- Rate limiting may affect results if run too frequently
- Streaming URL verification may fail due to CORS/referer requirements (but URLs may still work in player)
- The system is designed to work even if some sources fail (automatic failover)

## Environment Variables

```bash
# Optional: Override API URL
export API_URL=http://localhost:3001

# Run tests
npx tsx testing/test-home-page-apis.ts
```

## Quick Test Command

For a quick verification that everything is working:

```bash
# Test just the home page (fastest)
npx tsx testing/test-home-page-apis.ts

# Test filters (medium speed)
npx tsx testing/test-browser-filters.ts

# Full streaming test (slowest, most comprehensive)
npx tsx testing/test-streaming-all-sources.ts
```
