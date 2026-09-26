# ---- build ----
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl

COPY package*.json ./
# Prisma CLI e tsx também são usados nas migrations e no seed local.
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/prisma ./prisma
# O seed TypeScript importa helpers de src.
COPY --from=builder /app/src ./src
COPY --from=builder /app/dist ./dist

USER node
EXPOSE 3333
# Popula exemplos apenas em modo mock e sem usuários; preserva dados nos reinícios.
CMD ["sh", "-c", "set -e; ./node_modules/.bin/prisma migrate deploy; if [ \"${PLUGGY_MOCK:-0}\" = \"1\" ]; then users=$(node -e 'const {PrismaClient}=require(\"@prisma/client\"); const p=new PrismaClient(); p.user.count().then(n=>console.log(n)).catch(e=>{console.error(e);process.exitCode=1}).finally(()=>p.$disconnect());'); if [ \"$users\" = \"0\" ]; then npm run seed:mock; fi; fi; exec node dist/index.js"]
