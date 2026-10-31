# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
# GlassFolio — self-hosted image (local mode). Build from the repository root:
#   docker build -f docker/Dockerfile -t glassfolio .
# or simply: docker compose up -d --build

# ── Stage 1: build the app-only bundle in local deployment mode ────────────────
# Base image pinned by digest (supply-chain integrity); Dependabot bumps it weekly.
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS builder
WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts: no dependency install script runs during the image build
RUN npm ci --ignore-scripts

COPY index.html vite.config.ts tsconfig.json tailwind.config.ts postcss.config.js ./
COPY public ./public
COPY locales ./locales
COPY server ./server
COPY mcp-server ./mcp-server
COPY src ./src

ENV VITE_DEPLOYMENT_MODE=local \
    VITE_APP_TARGET=app
RUN npm run build:local

# ── Stage 2: minimal runtime (static assets + Node server, no node_modules) ────
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS runner

LABEL org.opencontainers.image.title="GlassFolio" \
      org.opencontainers.image.description="Self-hosted, end-to-end encrypted wealth dashboard" \
      org.opencontainers.image.source="https://github.com/Damien-Esilv/GlassFolio" \
      org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    STATIC_DIR=/app/dist

WORKDIR /app
# /data is the only writable path; a named volume inherits this ownership on first use.
RUN mkdir -p /data && chown node:node /data

COPY --from=builder /app/dist ./dist
COPY server ./server
COPY mcp-server ./mcp-server

USER node
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/health || exit 1

CMD ["node", "server/docker-server.mjs"]
