FROM node:20-alpine AS builder

WORKDIR /app

# NOTE: We copy manifest files first to maximize Docker layer cache reuse
# when source code changes but dependencies stay the same.
COPY package*.json ./

# COMPAT: The project currently relies on legacy peer dependency resolution
# because of a transient ecosystem mismatch already identified in the phase notes.
RUN npm ci --legacy-peer-deps

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# NOTE: Production image only receives the minimum runtime artifacts needed
# to execute the compiled Nest application and Prisma client.
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

COPY prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/src/main.js"]