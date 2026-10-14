# syntax=docker/dockerfile:1
# Browser-free Node-only alternative. Build context MUST be the repo root (parent of server/):
#   docker build -f server/Dockerfile .
#   docker build -f Dockerfile .
# (If context is ./server, COPY server/... will fail.)

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

FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive
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
# Chromium belongs in a separately approved extractor, never in this 512 MB API.
ENV BROWSER_EXTRACTOR=remote
ENV LOW_MEMORY_PROFILE=true
ENV MEMORY_LIMIT_MB=512
ENV NODE_OPTIONS="--max-old-space-size=220"

WORKDIR /app

COPY server/package*.json ./
COPY server/patches ./patches
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Starting point for the hentai index on hosts whose disk is wiped between runs (see hentai-index.ts).
COPY server/seed ./seed

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
