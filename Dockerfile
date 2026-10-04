# Katalog — Express + SQLite. better-sqlite3 needs a toolchain plus python for
# node-gyp, so the build stage keeps those and the runtime stage does not.
FROM node:20-bookworm-slim AS build
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim
ENV NODE_ENV=production PORT=3002 DB_PATH=/data/katalog.db
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY server.mjs ./
COPY public ./public
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3002
CMD ["node", "server.mjs"]
