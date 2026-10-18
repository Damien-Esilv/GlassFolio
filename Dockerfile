# Stage 1: Build lean application container
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Clean install dependencies
RUN npm ci

# Copy application source code
COPY . .

# Build application with app-only target and local self-hosted deployment mode
ENV VITE_DEPLOYMENT_MODE=local
ENV VITE_APP_TARGET=app

RUN npm run build:local

# Stage 2: Production runtime server with volume persistence
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
ENV DATA_DIR=/data
ENV STATIC_DIR=/app/dist

# Create data directory and secure permissions
RUN mkdir -p /data && chown -R node:node /data /app

# Copy production build assets & runtime server script
COPY --from=builder --chown=node:node /app/dist /app/dist
COPY --chown=node:node scripts/docker-server.mjs /app/scripts/docker-server.mjs

USER node
VOLUME ["/data"]
EXPOSE 80

# Health check against local server
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/health || exit 1

# Start Node.js runtime server with disk persistence
CMD ["node", "scripts/docker-server.mjs"]
