FROM node:20-slim AS base
WORKDIR /app
# Prisma's query/schema engines need libssl; bcrypt falls back to compiling
# from source if no prebuilt binary matches this exact image — build tools
# cover that fallback so the image doesn't break on an unmatched platform.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Placeholder values ONLY to satisfy prisma.config.ts's env("DATABASE_URL")
# lookup during `prisma generate` (triggered both by `npm ci`'s postinstall
# hook and the explicit generate step below) — `.env` is deliberately not
# present in the build context (see .dockerignore), so with nothing set here
# `prisma generate` throws PrismaConfigEnvError immediately, before it ever
# tries to connect to anything. `prisma generate` never actually connects to
# a database, so any syntactically valid URL works. docker-compose.yml's
# `environment:` block overrides both with the real values at container
# runtime — these placeholders are never used for an actual connection.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV TENANT_DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

FROM base AS deps
COPY package.json package-lock.json ./
# --ignore-scripts: this stage only copies package.json/package-lock.json
# (deliberately, so Docker can cache dependency installs separately from
# source changes) — package.json's own `postinstall` script runs `prisma
# generate`, which needs prisma/schema.prisma to exist. That file isn't
# copied in until the `build` stage below, which has its own explicit
# generate step that runs correctly once the real files are present.
# Without --ignore-scripts, postinstall fires here anyway and fails with
# "Could not find Prisma Schema" before it ever gets to the build stage.
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
RUN npm run prisma:generate && npm run tenant:generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
# From `build`, not `deps`: the control-plane Prisma client generates its
# output *inside* node_modules (node_modules/@prisma/client,
# node_modules/.prisma/client) — that only happens in the `build` stage's
# copy of node_modules (its explicit `prisma generate` step), never in
# `deps`'s copy (installed with --ignore-scripts, before generation). `build`
# has everything `deps` has, plus that generated output, so it's always the
# right source here.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
# The compiled .next output is self-contained for `next start` — it doesn't
# need raw src/ at runtime. But the entrypoint's own tooling (prisma/seed.ts,
# scripts/*.ts) runs via `tsx` directly against TypeScript source, not
# through Next's bundler, and imports from src/lib/* — so the whole src/
# directory (which includes src/generated, the generated Prisma clients)
# has to be present too, not just the app's compiled output.
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
