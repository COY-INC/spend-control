# ---- build ----
FROM node:22.18.0-alpine AS builder
# Prisma precisa do openssl no Alpine para escolher o engine certo
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.seed.json ./
COPY src ./src
# Compila a API e o seed mock para JS: o runtime não precisa de tsx nem de src/
RUN npm run build && npm run build:seed

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
COPY --chown=node:node --from=builder /app/dist-seed ./dist-seed
COPY --chown=node:node docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER node
EXPOSE 3333
# GET /health precisa responder 200 (API de pé e banco acessível). Mesmos parâmetros que antes
# viviam só no healthcheck do infra/docker-compose.yml — a imagem agora carrega o seu próprio.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3333/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["./docker-entrypoint.sh"]
