# spend-control

Dashboard de finanças pessoais para casais, alimentado por Open Finance (Pluggy).

---

## 1. Visão geral

Quem divide as contas da casa costuma ter o dinheiro espalhado em vários bancos, cartões e
faturas — e pouca visão do todo. O **spend-control** reúne contas, cartões de crédito, faturas,
compras parceladas, investimentos e orçamentos do casal em um único painel, com visões
"Minhas Finanças" e "Finanças do Casal".

Os dados vêm dos bancos via **Pluggy** (Open Finance). Para desenvolvimento e avaliação existe
um **modo mock** (`PLUGGY_MOCK=1`) que dispensa credenciais e usa dados fictícios.

**Principais tecnologias**

| Camada | Tecnologias |
|---|---|
| Backend | Node.js 22, Express, TypeScript, Prisma ORM, JWT |
| Banco de dados | PostgreSQL |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, Recharts |
| Integração | Pluggy SDK (connect token, webhook, sync de transações) |
| Testes | Jest + Testing Library (frontend) |
| CI | GitHub Actions |

**Estrutura do repositório**

```
spend-control/
├── backend/     API REST (Express + Prisma)
├── frontend/    SPA React (Vite)
├── infra/       docker-compose do PostgreSQL
└── .github/     workflows do GitHub Actions
```

---

## 2. Arquitetura

```
┌─────────────┐   HTTP/JSON   ┌──────────────────┐    SQL     ┌──────────────┐
│  Navegador  │ ────────────▶ │   API (backend)  │ ─────────▶ │  PostgreSQL  │
│  React SPA  │ ◀──────────── │  Express :3333   │ ◀───────── │    :5432     │
│   :5173     │  Bearer JWT   └────────┬─────────┘   Prisma   └──────────────┘
└─────────────┘                        │  ▲
                        connect token, │  │ webhook (novas transações)
                        sync periódico ▼  │
                               ┌──────────────────┐
                               │  Pluggy (Open    │   (substituída por stub
                               │  Finance)        │    quando PLUGGY_MOCK=1)
                               └──────────────────┘
```

- **Frontend** — SPA que autentica por PIN (`/auth`) e consome a API com token JWT.
- **API** — rotas por domínio (`/accounts`, `/cards`, `/transactions`, `/budgets`,
  `/investments`, ...); recebe webhooks da Pluggy e roda um sync automático periódico.
  Expõe `GET /health` (pública, sem JWT) checando a conexão com o banco.
- **PostgreSQL** — persistência; schema e migrations gerenciados pelo Prisma.
- **Pluggy** — agregador Open Finance que fornece contas e transações dos bancos.

---

## 3. Como rodar localmente (sem Docker)

**Pré-requisitos**
- Node.js **22.18.0** (fixado em `.nvmrc` — use `nvm use` na raiz)
- PostgreSQL rodando (nativo ou só o banco via `infra/docker-compose.yml`)

**Passo a passo**

```bash
# 1. Dependências
cd backend  && npm install
cd ../frontend && npm install

# 2. Variáveis de ambiente (os .env não são versionados)
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env
```

Conteúdo mínimo do `backend/.env` para rodar com dados fictícios:

```
DATABASE_URL="postgresql://admin:adminpassword@localhost:5433/findb"
JWT_SECRET="dev-secret-troque"
PLUGGY_MOCK=1
```

O `frontend/.env` pode ficar vazio — os valores padrão apontam para a API local.

```bash
# 3. Banco (opcional, se não tiver Postgres nativo) — sobe na porta 5433
docker compose -f infra/docker-compose.yml up -d

# 4. Tabelas + dados de exemplo (primeira vez ou após mudar o schema)
cd backend && npm run db:setup

# 5. Rodar — dois terminais, backend primeiro
cd backend  && npm run dev     # API -> http://localhost:3333
cd frontend && npm run dev     # Web -> http://localhost:5173
```

Acesse **http://localhost:5173** e entre com um dos PINs criados pelo seed:
**Marido → `1234`** · **Esposa → `5678`**.

> Para um banco com muito mais dados (6 meses de transações, faturas, parcelas, investimentos),
> veja [COMO_RODAR_MOCK.md](./COMO_RODAR_MOCK.md).

**Pluggy real (opcional):** preencha `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`
(obtidos em [dashboard.pluggy.ai](https://dashboard.pluggy.ai)), remova `PLUGGY_MOCK` e
reinicie o backend.

---

## 4. Como rodar com Docker Compose

> 🚧 **Em construção** — será preenchida na issue do Docker Compose.

Caminho principal de avaliação. Objetivo: subir banco, API e frontend com um único comando.

```bash
git clone https://github.com/COY-INC/spend-control.git
cd spend-control
cp .env.example .env
docker compose up --build
```

---

## 5. Como rodar a partir da imagem publicada

> 🚧 **Em construção** — será preenchida na issue de publicação no Docker Hub.

```bash
docker pull <usuario-dockerhub>/spend-control:latest
docker compose -f docker-compose.prod.yml up
```

---

## 6. Como rodar os testes

**Frontend** (Jest + Testing Library):

```bash
cd frontend && npm test
```

**Backend** (test runner nativo do Node via `tsx --test`):

```bash
cd backend && npm test
```

Roda todos os arquivos `*.test.ts` em `src/`. Um teste quebrado faz o comando sair com
código ≠ 0.

---

## 7. Pipeline CI/CD

As execuções ficam na aba **[Actions](https://github.com/COY-INC/spend-control/actions)** do GitHub.

**CI** — `.github/workflows/ci.yaml`
Roda em todo Pull Request para a `main` e em push na `main`. Executa em paralelo
(matriz) para `frontend` e `backend`:

1. Checkout do código e setup do Node (versão do `.nvmrc`, com cache do npm)
2. `npm ci` — instala dependências a partir do lockfile
3. `npx prisma generate` — gera o client do Prisma (só backend)
4. `npm test` — testes unitários
5. `npm run build` — compila a aplicação
6. Em caso de falha, publica no resumo do job qual etapa quebrou e a causa provável

**Automação de issues** — `.github/workflows/close-issue-on-merge.yml`
Quando um PR é mergeado, fecha automaticamente a issue cujo número aparece no nome da
branch (ex.: branch `18-readme` fecha a issue #18).

**CD**

> 🚧 **Em construção** — build da imagem Docker, validação com Compose e publicação no
> Docker Hub, executado só após o CI passar e só na `main`.

**Fluxo de trabalho (GitHub Flow):** issue → branch curta `<nº-issue>-descricao` a partir da
`main` → Pull Request → CI verde + revisão → merge.

---

## 8. Variáveis de ambiente

Os valores reais ficam em arquivos `.env`, que **não são versionados**. Os modelos estão em
`backend/.env.example` e `frontend/.env.example`.

**Backend** (`backend/.env`)

| Variável | Para que serve | Valor de exemplo |
|---|---|---|
| `DATABASE_URL` | String de conexão do PostgreSQL | `postgresql://admin:adminpassword@localhost:5433/findb` |
| `JWT_SECRET` | Segredo para assinar os tokens de login (obrigatório) | `dev-secret-troque` |
| `PORT` | Porta da API (padrão `3333`) | `3333` |
| `CORS_ORIGIN` | Origens do frontend liberadas no CORS, separadas por vírgula (padrão `http://localhost:5173`) | `http://localhost:5173` |
| `PLUGGY_MOCK` | `1` usa um stub local da Pluggy, sem credenciais nem rede | `1` |
| `PLUGGY_CLIENT_ID` | Client ID da Pluggy (só com Pluggy real) | `seu-client-id` |
| `PLUGGY_CLIENT_SECRET` | Client secret da Pluggy (só com Pluggy real) | `seu-client-secret` |
| `SYNC_INTERVAL_HOURS` | Intervalo do sync automático em horas (padrão `6`; `0` desliga) | `6` |
| `WEBHOOK_URL` | URL pública deste backend para receber webhooks da Pluggy | `https://sua-api.exemplo.com/pluggy/webhook` |

**Frontend** (`frontend/.env`)

| Variável | Para que serve | Valor de exemplo |
|---|---|---|
| `VITE_API_URL` | URL base da API (padrão `http://localhost:3333`) | `http://localhost:3333` |
| `VITE_PLUGGY_CONNECTOR_IDS` | Conectores exibidos no widget Pluggy, separados por vírgula (vazio = todos) | `200` |
| `VITE_INTERNAL_PARTY_PATTERN` | Regex que identifica transferências internas do casal (não contam como entrada/saída) | `fulano\|ciclana` |

---

## 9. Uso de IA

> Registro do uso de IA no projeto. Lembrete da disciplina: *toda saída de IA é hipótese até
> ser validada por teste, execução ou revisão humana.*

| Data | Ferramenta | O que foi pedido | O que foi aceito | O que foi corrigido / descartado |
|---|---|---|---|---|
| | | | | |

---

## 10. Troubleshooting

**Porta 5432 ocupada / Prisma retorna `P1000 Authentication failed`**
No Windows é comum já existir um PostgreSQL nativo na porta 5432 — a aplicação acaba
conectando nele, com outro usuário e senha. Por isso o banco do `infra/docker-compose.yml`
é publicado na porta **5433**. Confira se o `DATABASE_URL` usa `localhost:5433` e
usuário/senha `admin`/`adminpassword`.

**Login retorna 401 / erro de JWT**
A variável `JWT_SECRET` não está definida no `backend/.env`. Sem ela a API não consegue
assinar nem validar tokens.

**Frontend não carrega dados ("não acha a API")**
O backend precisa estar rodando antes do frontend, na porta 3333. Com `VITE_API_URL` vazio o
frontend usa `http://localhost:3333`; se mudar a porta da API, ajuste essa variável e
também o `CORS_ORIGIN` do backend.
