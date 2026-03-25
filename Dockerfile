FROM node:20-alpine AS builder

WORKDIR /app

# NOTE: The project currently carries an old Nest schematics dependency whose
# peer range conflicts with the TypeScript version used by the application.
# We keep the container build unblocked with legacy peer resolution and defer
# the dependency cleanup to a dedicated maintenance step.
ENV NPM_CONFIG_LEGACY_PEER_DEPS=true

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci
RUN npx prisma generate

COPY nest-cli.json tsconfig*.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NPM_CONFIG_LEGACY_PEER_DEPS=true

COPY package*.json ./
COPY prisma ./prisma

# NOTE: Runtime keeps only production dependencies. Prisma generated artifacts
# are copied from the builder stage because the Prisma CLI itself is not needed
# in the final image.
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

# HACK: Render free instances do not support pre-deploy commands. We run
# migrations during container startup to keep production schema aligned
# without introducing a paid-only platform dependency.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]