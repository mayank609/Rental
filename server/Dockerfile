# ---------- RentNest API / worker image ----------
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --include-workspace-root=false --ignore-scripts || npm install --workspace server --ignore-scripts

FROM deps AS build
COPY server server
RUN cd server && npx prisma generate && npx tsc -p tsconfig.build.json

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY server/prisma ./server/prisma
COPY server/package.json server/prisma.config.ts ./server/
WORKDIR /app/server
RUN useradd -m -u 10001 app && mkdir -p uploads && chown -R app:app /app/server
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Run migrations then start (override CMD with `node dist/worker.js` for the worker)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
