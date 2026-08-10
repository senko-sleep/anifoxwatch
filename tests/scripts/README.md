# Watch Page Debug Scripts

Organized test and diagnostic scripts for the watch page (`/watch?id=anilist-XXXXX&ep=N`).

## Structure

```
tests/scripts/
├── watch-debug/          # Watch page browser diagnostics
│   ├── diagnose.mjs             # Full page diagnostic (console, network, player state)
│   ├── capture-watch-errors.mjs # Error capture with episode switching
│   ├── watch-script.mjs         # Reusable watch page test helper
│   ├── watch-mount.mjs           # Page mount/debug helper
│   └── legacy-diagnose.mjs      # Old diagnose script (reference)
│
├── stream-debug/         # Backend stream resolution diagnostics
│   ├── timing.mjs                # Measure stream resolution timing
│   ├── api-test.mjs              # HTTP API endpoint testing
│   ├── test-backend-resolve.mjs  # Direct sourceManager testing
│   └── test-207141.mjs           # Specific anilist-207141 test
│
├── browser-debug/        # Browser console/network capture
│   ├── capture.mjs               # Main console error capture
│   ├── capture-console.mjs       # Console log capture
│   ├── capture-cdp.mjs           # Chrome DevTools Protocol capture
│   ├── test-browser-fetch.mjs    # Browser fetch testing
│   └── test-fetch-cdp.mjs        # CDP fetch testing
│
├── check-dom.mjs         # DOM state inspection
├── check-react.mjs       # React component state inspection
└── inspect-page.mjs      # Page inspection helper
```

## Usage

### Watch Page Diagnostics
```bash
# Diagnose a watch page (console, network, player state)
node tests/scripts/watch-debug/diagnose.mjs http://localhost:8081/watch?id=anilist-1639&ep=2

# Capture errors during page load and episode switching
node tests/scripts/watch-debug/capture-watch-errors.mjs http://localhost:8081/watch?id=anilist-1639&ep=2
```

### Stream Resolution Timing
```bash
# Measure backend stream resolution timing
node tests/scripts/stream-debug/timing.mjs 1639 2
node tests/scripts/stream-debug/timing.mjs 207141 2

# Test HTTP API endpoints directly
node tests/scripts/stream-debug/api-test.mjs 1639 2
```

### Browser Console Capture
```bash
# Capture console errors and network failures
node tests/scripts/browser-debug/capture.mjs http://localhost:8081/watch?id=anilist-1639&ep=2
```

## Prerequisites

- Node.js 18+
- patchright (or playwright) installed at VS Code extension path (for browser scripts)
- Backend server running on port 3001
- Frontend dev server running on port 8081

## Common Issues

### anilist-1639
- Backend resolves stream via Aniwaves (20s+)
- Frontend timeout was 10s → increased to 25s
- Backend global timeout was 10s → increased to 20s
- Loading message now says "Resolving stream — may take up to 30 s" for anilist- IDs

### anilist-207141
- Backend returns 404 "No streaming sources found"
- No sources available for Solo Leveling Season 2 Episode 2
- Frontend shows error gracefully (no infinite loading)
- This is expected behavior when content isn't available yet
