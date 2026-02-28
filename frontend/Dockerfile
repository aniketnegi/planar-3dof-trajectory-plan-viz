FROM oven/bun:alpine AS base
LABEL org.opencontainers.image.authors="Aniket Negi <aniket.negi19104@gmail.com>"

FROM base AS deps
WORKDIR /app
# Use a wildcard in case you ever switch between bun.lock and bun.lockb
COPY package.json bun.lock* ./
# Cache the downloaded packages globally in Bun
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Keep the Next.js cache persistent between docker builds to heavily speed up rebuilds
RUN --mount=type=cache,target=/app/.next/cache \
    bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Standalone mode only needs these specific folders
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

# Next.js standalone outputs a server.js file natively intended for Node,
# but Bun runs it perfectly and much faster.
CMD ["bun", "run", "server.js"]
