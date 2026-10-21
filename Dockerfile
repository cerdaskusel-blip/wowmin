# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
# Optional corporate CA is mounted only during installation, never in an image layer.
RUN --mount=type=secret,id=npm_ca,target=/tmp/npm-ca.pem \
    --mount=type=cache,target=/root/.npm \
    if [ -f /tmp/npm-ca.pem ]; then export NODE_EXTRA_CA_CERTS=/tmp/npm-ca.pem; fi; \
    npm ci --no-audit --no-fund --fetch-timeout=60000 --fetch-retries=1 --loglevel=info

FROM dependencies AS build
COPY . .
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_USE_EMULATORS=false \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=wowmin-workshop \
    NEXT_PUBLIC_APP_URL=https://wowmin-workshop.web.app \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    FIREBASE_PROJECT_ID=wowmin-workshop \
    FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
RUN test -n "$NEXT_PUBLIC_FIREBASE_API_KEY" && test -n "$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" && test -n "$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
RUN npm run build

FROM dependencies AS worker-dependencies
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=worker-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node src/lib ./src/lib
COPY --chown=node:node scripts/cleanup-once.ts ./scripts/cleanup-once.ts
USER node
CMD ["node", "--import", "tsx", "scripts/cleanup-once.ts"]

FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=8080
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 8080
CMD ["node", "server.js"]
