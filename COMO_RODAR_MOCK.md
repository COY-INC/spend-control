# Como rodar o fin-dash localmente com dados mock

Réplica do projeto montada para desenvolvimento local **sem Pluggy e sem Docker**: banco no
Postgres nativo da máquina e um seed determinístico que popula todas as seções do dashboard.

Diferenças em relação ao passo a passo padrão ([README, seção 3](./README.md#3-como-rodar-localmente-sem-docker)):

| | Original | Este ambiente |
|---|---|---|
| Banco | Postgres em Docker (`:5433`) | Postgres nativo da máquina (`:5432`), database `findb_mock` |
| Seed | `npm run seed` (2 usuários, ~40 transações) | `npm run seed:mock` (~370 transações, cartões, faturas, parcelas, investimentos, orçamentos) |
| Node | 22+ | 22.18.0 (fixado em `.nvmrc`) |
| Pluggy | credenciais reais ou `PLUGGY_MOCK=1` | `PLUGGY_MOCK=1`, sync automático desligado |

---

## Pré-requisitos
- **Node 22** (`nvm use` na raiz do projeto lê o `.nvmrc`)
- **PostgreSQL rodando em `localhost:5432`** com o seu usuário do sistema podendo criar bancos
  (é o Postgres que já está instalado na máquina — não precisa de Docker)

## 1. Primeira vez

```bash
nvm use                                    # Node 22.18.0
createdb -h localhost -p 5432 findb_mock   # cria o banco (só uma vez)

cd backend  && npm install
cd ../frontend && npm install

cd ../backend && npm run db:setup:mock     # migrations + seed rico
```

Os arquivos `.env` já estão criados (não são versionados). O do backend aponta para
`postgresql://<seu-usuário>@localhost:5432/findb_mock`, define um `JWT_SECRET` de dev,
liga `PLUGGY_MOCK=1` e desliga o sync automático (`SYNC_INTERVAL_HOURS=0`).

## 2. Rodar (dois terminais, backend primeiro)

```bash
# Terminal 1
cd backend && npm run dev      # API -> http://localhost:3333

# Terminal 2
cd frontend && npm run dev     # Web -> http://localhost:5173
```

## 3. Entrar

http://localhost:5173 — login por PIN:

- **Marido** → `1234`
- **Esposa** → `5678`

---

## O que o seed mock gera

`backend/prisma/seed-mock.ts` — **determinístico** (PRNG com semente fixa): rodar de novo
produz exatamente o mesmo banco. As datas são relativas a *hoje*, então o dashboard sempre
abre com dados do mês corrente.

- **2 usuários** (Nubank e Itaú), cada um com conta corrente (com caixinhas/`reservedBalances`),
  poupança e cartão de crédito com bandeira e cartão dependente
- **~370 transações** cobrindo 6 meses: salário, aluguel, contas fixas, mercado, restaurante,
  transporte, lazer, saúde, transferências internas do casal, mix `POSTED`/`PENDING`
- **12 faturas de cartão** (6 por cartão). O cartão Nubank fechou há 7 dias e vence em 3 →
  mostra **fatura aberta + fechada a vencer**; o Itaú já venceu → mostra **aberta + histórico**
- **4 compras parceladas** com metadata `N/M` real, gerando faturas futuras e Compromissos;
  as parcelas a vencer de uma delas são `manual` (projeção do usuário)
- **1 compra de banco que não projeta parcela** (`FASTSHOP*GELADEIRA`, 4 de 12 lançadas) →
  alimenta o card de **Sugestões de parcelas**
- **1 parcela antecipada** por cartão e **1 comentário** ancorado numa compra parcelada
- **5 investimentos**, **9 orçamentos** e **14 categorias**

Para regerar o banco do zero a qualquer momento:

```bash
cd backend && npm run seed:mock
```

## Voltar a usar Docker (opcional)

Se o Docker Desktop voltar a rodar, dá para usar o Postgres do `infra/docker-compose.yml`:
suba com `docker compose -f infra/docker-compose.yml up -d` e troque a `DATABASE_URL` do
`backend/.env` para `postgresql://admin:adminpassword@localhost:5433/findb`, depois rode
`npm run db:setup:mock` de novo.
