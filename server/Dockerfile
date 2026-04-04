# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
COPY patches ./patches
RUN npm ci

COPY src ./src
RUN npx tsc --project tsconfig.json

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-slim

# Chromium for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    dumb-init \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
COPY patches ./patches
RUN npm ci --only=production

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist

# Cloud Run injects PORT; default to 8080 if not set
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
