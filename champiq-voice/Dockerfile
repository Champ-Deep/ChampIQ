# ============================================
# ChampIQ Voice Gateway — CLI + HTTP Service
# ============================================

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
COPY bin/ ./bin/

RUN npm run build

# ── Production image ──────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Config is mounted at runtime via CHAMPIQ_CONFIG or volume
# Secrets should come from env vars, not baked into image
ENV NODE_ENV=production

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3001}/health || exit 1

CMD ["node", "dist/src/cli/index.js", "serve"]
