# syntax=docker/dockerfile:1
# API image — Docker build context must be the REPO ROOT (monorepo), not ./server.
# Render: Dockerfile path ./Dockerfile, context .   OR path ./server/Dockerfile, context still .
#
# The image runs two processes (see media-proxy/src/main.rs for why):
#
#   media-proxy (Rust)  :$PORT   public; carries media bytes, forwards everything else
#   node        (API)   :3001    loopback only; all the policy and scraping
#
# Setting MEDIA_ACCEL=0 leaves Node serving media itself, exactly as before the split.

# ── Rust data plane ────────────────────────────────────────────────────────────
FROM rust:1.83-slim-bookworm AS rust-builder

WORKDIR /build

# Dependencies are their own layer: they are what takes the minutes, and they change far less
# often than main.rs does. The dummy main is what lets cargo resolve and compile them alone.
COPY media-proxy/Cargo.toml ./Cargo.toml
RUN mkdir -p src && echo 'fn main() {}' > src/main.rs
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/build/target \
    cargo build --release && rm -rf src

COPY media-proxy/src ./src
# cargo keys rebuilds on mtime; COPY can preserve one older than the dummy build's artifacts,
# which would leave the placeholder binary in place. Touching it makes the rebuild unambiguous.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/build/target \
    touch src/main.rs \
    && cargo build --release \
    && cp target/release/media-proxy /build/media-proxy

# ── Node API build ─────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY server/package*.json server/tsconfig.json ./
COPY server/patches ./patches
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY server/src ./src
RUN npx tsc --project tsconfig.json

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update -qq \
    && apt-get install -qq -y --no-install-recommends \
    chromium \
    chromium-sandbox \
    ca-certificates \
    curl \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-freefont-ttf \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libnss3 \
    libpango-1.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxss1 \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
# Node no longer carries media bytes, so its heap is sized for the API alone. The headroom this
# frees on a 512MB box goes to Chromium, whose launch is the thing that actually runs out of it.
ENV NODE_OPTIONS="--max-old-space-size=256"

WORKDIR /app

COPY server/package*.json ./
COPY server/patches ./patches
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=rust-builder /build/media-proxy /usr/local/bin/media-proxy

# Starting point for the hentai index on hosts whose disk is wiped between runs (see hentai-index.ts).
COPY server/seed ./seed

COPY deploy/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

# $PORT is the Rust proxy's, public. Node binds NODE_PORT on loopback behind it.
ENV PORT=8080
ENV NODE_PORT=3001
ENV MEDIA_ACCEL=1
EXPOSE 8080

# dumb-init reaps the zombies Chromium leaves behind and forwards signals to the whole group.
ENTRYPOINT ["dumb-init", "--"]
CMD ["/usr/local/bin/start.sh"]
