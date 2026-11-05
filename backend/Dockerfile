# syntax=docker/dockerfile:1

# Shared base: Node 24 (same major as Render) plus the OpenSSL runtime that
# Prisma engines require on Alpine.
FROM node:24-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV npm_config_update_notifier=false

# Full dependency tree, used to type-check, build, and run Prisma CLI tooling.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Compile TypeScript and generate the Prisma client once, for both targets.
FROM deps AS build
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production-only dependencies for the API runtime image.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# API runtime: no Prisma CLI, no devDependencies, non-root user.
FROM base AS runtime
ENV NODE_ENV=production
COPY --chown=node:node package.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]

# Migration/seed runner: keeps the Prisma CLI and migrations. Used by the
# `migrate` and `seed` Compose services, never by the deployed API image.
FROM deps AS migrator
ENV NODE_ENV=production
COPY prisma ./prisma
RUN npx prisma generate
CMD ["npx", "prisma", "migrate", "deploy"]
