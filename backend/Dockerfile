# ---- build ----
FROM node:22.18.0-alpine AS builder
# Prisma precisa do openssl no Alpine para escolher o engine certo
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:22.18.0-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node --from=builder /app/prisma/schema.prisma ./prisma/
COPY --chown=node:node --from=builder /app/prisma/migrations ./prisma/migrations
COPY --chown=node:node --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=builder /app/dist ./dist

USER node
EXPOSE 3333
# --no-install: usa o Prisma CLI do lockfile; nunca baixa do npm no start
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && exec node dist/index.js"]
