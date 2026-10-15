# syntax=docker/dockerfile:1

##
## ---- Stage: shared dependency install (full, for building) ----
## better-sqlite3 is a native module; build tools are only here as a
## fallback for when no prebuilt binary matches the platform.
##
FROM node:24-bookworm-slim AS deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci

##
## ---- Stage: production-only server dependencies ----
##
FROM deps AS deps-prod
WORKDIR /app
RUN rm -rf node_modules && npm ci --omit=dev --workspace=server

##
## ---- Stage: build the Vite frontend into static assets ----
##
FROM deps AS client-builder
WORKDIR /app
COPY client client
RUN npm run build --workspace=client

##
## ---- Stage: compile the Express/TypeScript backend ----
##
FROM deps AS server-builder
WORKDIR /app
COPY server server
RUN npm run build --workspace=server

##
## ---- Stage: backend dev server (hot reload via tsx) ----
## Used by docker-compose's dual-service dev setup. Source is bind-mounted
## over this image at runtime so edits take effect without a rebuild.
##
FROM deps AS dev
WORKDIR /app
COPY server server
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=server"]

##
## ---- Stage: frontend dev server (Vite, hot module reload) ----
##
FROM deps AS client-dev
WORKDIR /app
COPY client client
ENV VITE_POLL=1
EXPOSE 5175
CMD ["npm", "run", "dev", "--workspace=client", "--", "--host"]

##
## ---- Stage: runtime image ----
##
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    ORCA_USER_DIR=/orca

WORKDIR /app/server

COPY --from=deps-prod /app/node_modules /app/node_modules
COPY --from=server-builder /app/server/dist ./dist
COPY server/package.json ./package.json
COPY --from=client-builder /app/client/dist ../client/dist
COPY package.json /app/package.json

RUN mkdir -p /data && chown -R node:node /data /app/server

USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
