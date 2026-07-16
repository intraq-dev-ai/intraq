FROM node:24.16.0-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/agent-core/package.json packages/agent-core/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json

RUN npm ci

COPY . .

RUN npm run build

RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV API_PORT=4100
ENV SERVE_WEB_FROM_API=true
ENV WEB_DIST_DIR=/app/apps/web/dist

EXPOSE 4100

CMD ["npm", "start"]
