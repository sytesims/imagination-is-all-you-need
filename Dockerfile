# Imagination Is All You Need app image: Fastify API + built web UI on one port (8080).
# Build: docker build -t openhiggsfield:local .   (local only; do not push to a public registry)
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl python3 python3-pil python3-numpy && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    OPENHIGGSFIELD_DATA_DIR=/data \
    OPENHIGGSFIELD_ENV_FILE=/data/.env.local \
    OPENHIGGSFIELD_BACKEND=mock \
    API_PORT=8787 \
    WEB_PORT=8080
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/samples ./server/samples
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/workflows ./workflows
COPY --from=build /app/plugins ./plugins
COPY --from=build /app/openapi.json ./
COPY docker/start.mjs docker/envfile.mjs ./docker/
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "docker/start.mjs"]
