# syntax=docker/dockerfile:1
# Same image as /Dockerfile. Build context MUST be the repo root (parent of server/):
#   docker build -f server/Dockerfile .
#   docker build -f Dockerfile .
# (If context is ./server, COPY server/... will fail.)

FROM node:20-slim AS builder

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
    chromium \
    chromium-sandbox \
    ca-certificates \
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
ENV NODE_OPTIONS="--max-old-space-size=256"

WORKDIR /app

COPY server/package*.json ./
COPY server/patches ./patches
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

COPY --from=builder /app/dist ./dist

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
