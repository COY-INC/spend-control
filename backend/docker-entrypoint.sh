#!/bin/sh
# Entrypoint da imagem do backend. Ver Dockerfile para o HEALTHCHECK (GET /health) que monitora
# o processo depois que ele sobe.
set -e

# Prisma CLI vem do lockfile (nunca baixa do npm no start).
./node_modules/.bin/prisma migrate deploy

# Popula dados de exemplo apenas em modo mock (PLUGGY_MOCK=1) e só se o banco estiver vazio —
# preserva dados reais entre reinícios do container.
if [ "${PLUGGY_MOCK:-0}" = "1" ]; then
  users=$(node -e '
    const { PrismaClient } = require("@prisma/client");
    const p = new PrismaClient();
    p.user.count()
      .then((n) => console.log(n))
      .catch((e) => { console.error(e); process.exitCode = 1; })
      .finally(() => p.$disconnect());
  ')
  if [ "$users" = "0" ]; then
    npm run seed:mock:dist
  fi
fi

exec node dist/index.js
