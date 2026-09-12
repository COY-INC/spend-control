<<<<<<< HEAD
# spend-control
É uma aplicação de monitoramento de gastos
=======
# fin-dash

Dashboard pessoal de Open Finance (Pluggy) para um casal. Monorepo.

- **backend/** — Node + Express + TypeScript + Prisma (PostgreSQL). Integração Pluggy (connect token, webhook, upsert de transações).
- **frontend/** — React (Vite) + TypeScript + Tailwind + Recharts. Visões "Minhas Finanças" e "Finanças do Casal", gráficos e conexão de bancos.
- **infra/** — `docker-compose.yml` do PostgreSQL.

## Rodar
Passo a passo completo em [COMO_RODAR.md](./COMO_RODAR.md).

```bash
docker compose -f infra/docker-compose.yml up -d   # sobe o Postgres
cd backend  && npm install && npm run db:setup && npm run dev   # API :3333
cd frontend && npm install && npm run dev                       # web :5173
```

Copie `backend/.env.example` para `backend/.env` e preencha as credenciais Pluggy.
Sem credenciais, use `PLUGGY_MOCK=1` para testar o fluxo localmente.
>>>>>>> ed4f778 (Initial commit)
