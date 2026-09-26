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

USER node
EXPOSE 3333
# Prisma CLI vem do lockfile (nunca baixa do npm no start).
# Popula exemplos apenas em modo mock e sem usuários; preserva dados nos reinícios.
CMD ["sh", "-c", "set -e; ./node_modules/.bin/prisma migrate deploy; if [ \"${PLUGGY_MOCK:-0}\" = \"1\" ]; then users=$(node -e 'const {PrismaClient}=require(\"@prisma/client\"); const p=new PrismaClient(); p.user.count().then(n=>console.log(n)).catch(e=>{console.error(e);process.exitCode=1}).finally(()=>p.$disconnect());'); if [ \"$users\" = \"0\" ]; then npm run seed:mock:dist; fi; fi; exec node dist/index.js"]
