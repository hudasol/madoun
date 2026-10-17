# Optional container image. Nothing in this repository requires Docker; npm scripts run without it.
# Build:  docker build -t madoun .
# Run:    docker run --rm --read-only --tmpfs /app/.next/cache --tmpfs /tmp -p 3000:3000 madoun
# The running app needs no outbound network (proved for the plain build by scripts/offline-check.mjs);
# run it on a network with egress blocked. All data is synthetic and the signing key is the public demo key
# unless MADOUN_LEDGER_KEY_FILE points at a mounted development key (docs/key-custody.md).
# For anything beyond a demo, pin the base image by digest.

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
# Files are owned by root and read only for the app user; only the tmpfs mounts are writable.
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
