# Rejeki CMS — Express + node:sqlite (built-in, tanpa native build).
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3005 REJEKI_DB_PATH=/data/rejeki.sqlite
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
RUN mkdir -p /data /app/public/uploads && chown -R node:node /data /app
USER node
EXPOSE 3005
CMD ["node", "src/server.js"]
