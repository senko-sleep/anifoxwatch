# API image — Docker build context must be the REPO ROOT (monorepo), not ./server.
# Render: Dockerfile path ./Dockerfile, context .   OR path ./server/Dockerfile, context still .

FROM node:20-slim AS builder

WORKDIR /app

COPY server/package*.json server/tsconfig.json ./
COPY server/patches ./patches
RUN npm ci

COPY server/src ./src
RUN npx tsc --project tsconfig.json

FROM node:20-slim

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

COPY server/package*.json ./
COPY server/patches ./patches
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
