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
# Tracks the latest stable toolchain on purpose. There is no Cargo.lock yet, so cargo resolves every
# dependency to its newest release, and those routinely demand a newer compiler than any pin chosen
# today (a 1.83 pin failed exactly that way: zeroize 1.9 needs edition2024, icu_* needs 1.88).
# Once a Cargo.lock is committed, pin this to a fixed version and build with --locked.
FROM rust:1-slim-bookworm AS rust-builder

WORKDIR /build

# Dependencies are their own layer: they are what takes the minutes, and they change far less
# often than main.rs does. The dummy main is what lets cargo resolve and compile them alone.
COPY media-proxy/Cargo.* ./
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
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

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
# No Chromium in this image, by design: on a 512MB instance a browser next to the API is what
# stalled it. Browser extraction runs in the separate Cloud Run service (server/Dockerfile.extractor)
# and is reached over HTTPS via EXTRACTOR_URL / EXTRACTOR_TOKEN. With no browser binary here,
# nothing can launch one by accident. curl stays: the HentaiHaven source shells out to it.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update -qq \
    && apt-get install -qq -y --no-install-recommends \
    ca-certificates \
    curl \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production
ENV BROWSER_EXTRACTOR=remote
# Reserve room for Buffers, native allocations, and the media proxy within 512 MB.
ENV LOW_MEMORY_PROFILE=true
ENV MEMORY_LIMIT_MB=512
ENV NODE_OPTIONS="--max-old-space-size=220"

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

# Reap child processes and forward shutdown signals to the whole process group.
ENTRYPOINT ["dumb-init", "--"]
CMD ["/usr/local/bin/start.sh"]
