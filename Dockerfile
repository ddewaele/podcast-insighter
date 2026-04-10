# ─── Stage 1: install all dependencies ───────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ─── Stage 2: build the Vite frontend ────────────────────────────────────────
FROM deps AS frontend
COPY . .
RUN npm run build

# ─── Stage 3: production image ───────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

# Copy dependencies (includes tsx needed to run TS at runtime)
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

# Copy built frontend
COPY --from=frontend /app/dist ./dist

# Copy server source and config
COPY server/ ./server/
COPY shared/ ./shared/
COPY tsconfig.server.json ./

# Persistent directories (mount volumes here in prod)
RUN mkdir -p data output

EXPOSE 3001
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["npx", "tsx", "server/index.ts"]
