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
├── infra/       docker-compose
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
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d

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

Sobe **frontend + API + PostgreSQL**, com migrations automáticas e healthchecks.
O modo Pluggy mock está habilitado, sem exigir credenciais externas.

```bash
git clone https://github.com/COY-INC/spend-control.git
cd spend-control
cp infra/.env.example infra/.env
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --build --wait
```

- **Frontend** → http://localhost:8080
- **API / saúde** → http://localhost:3333/health
- **Banco para ferramentas locais** → `localhost:5433` (usuário `admin`, senha `adminpassword`, banco `findb`)

As configurações vêm do ambiente ou do arquivo informado por `--env-file`.
Copie `infra/.env.example` para `infra/.env` e ajuste os valores. Variáveis obrigatórias
ausentes interrompem o Compose com uma mensagem. Variáveis exportadas no terminal
têm prioridade sobre o arquivo. O `backend/.env` não é carregado por este Compose.
Ao alterar a porta externa da API ou do frontend, ajuste também `VITE_API_URL` e
`CORS_ORIGIN`, conforme necessário, e repita o comando com `--build`. A URL da API é incorporada ao build do frontend;
a API usa `db:5432` na rede interna, enquanto o navegador usa `localhost`.

Para verificar os serviços e os logs:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
curl --fail http://localhost:3333/health
curl --fail http://localhost:8080/
docker compose --env-file infra/.env -f infra/docker-compose.yml logs --tail=100
```

Em modo mock, o backend carrega dados de exemplo automaticamente após as migrations
quando não há usuários no banco. Reinícios preservam os dados existentes.
Login de exemplo: **Marido / PIN 1234** ou **Esposa / PIN 5678**.

Para recriar os exemplos manualmente (**apaga os dados atuais**):

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml exec backend npm run seed:mock:dist
```

Para encerrar, use `docker compose --env-file infra/.env -f infra/docker-compose.yml down`. O volume
`db-data` preserva os dados; adicionar `-v` apaga o banco. Se uma porta estiver ocupada,
altere a respectiva variável em `infra/.env`. Se houver erro de permissão no socket
Docker em Linux, execute os comandos com `sudo` no seu terminal.

---

## 5. Como rodar a partir da imagem publicada

O arquivo `docker-compose.prod.yml`, na raiz, usa somente imagens publicadas,
sem `build`, bind mounts ou dependência do código-fonte. O PostgreSQL fica na rede
interna, com volume persistente. Este fluxo é para avaliação local em modo mock.

Em uma pasta vazia, coloque apenas `docker-compose.prod.yml` e uma cópia de
`.env.prod.example` renomeada para `.env`.

O CD publica duas imagens no Docker Hub, cada uma com duas tags: a versão (`1.0.3`) e
`latest`. As versões disponíveis estão nas
[tags do repositório](https://github.com/COY-INC/spend-control/tags).

```bash
docker pull coyinc/spend-control-backend:latest
docker pull coyinc/spend-control-frontend:latest
docker compose --env-file .env -f docker-compose.prod.yml up -d --no-build --wait --wait-timeout 180
```

A API publica `http://localhost:3333` e o frontend `http://localhost:8080`.
Mantenha `API_PORT=3333` para a imagem publicada: esse endereço está incorporado ao frontend.
Libere essas portas antes de iniciar (encerre a stack de desenvolvimento, se necessário).
As migrations e o seed mock rodam automaticamente em um banco novo.
Entre com **Marido / PIN 1234** ou **Esposa / PIN 5678** e confira os dados no painel.
O healthcheck confirma disponibilidade; o login no navegador valida a integração.

```bash
docker compose --env-file .env -f docker-compose.prod.yml ps
curl --fail http://localhost:3333/health
curl --fail http://localhost:3333/auth/users
docker compose --env-file .env -f docker-compose.prod.yml logs --tail=100
```

Para usar uma versão rastreável, defina `IMAGE_TAG` no `.env` com uma versão publicada
(por exemplo, `1.0.3`, sem o prefixo `v` da tag Git),
execute `docker compose --env-file .env -f docker-compose.prod.yml pull` e repita o `up`.
`DOCKERHUB_NAMESPACE` permite selecionar a conta que publicou as imagens;
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `JWT_SECRET`,
`PLUGGY_MOCK`, `API_PORT`, `FRONTEND_PORT` e `CORS_ORIGIN` vêm do `.env`.
Mantenha as credenciais de `DATABASE_URL` consistentes com as do PostgreSQL.
Alterar essas credenciais no arquivo não altera usuários de um volume já inicializado.

Encerre com `docker compose --env-file .env -f docker-compose.prod.yml down`. Os dados persistem
no volume do projeto `spend-control-prod`; `down -v` apaga esses dados.

**Aceite e evidências:** siga [o checklist de entrega](docs/entrega-containers.md).
A publicação pública e o teste em outra máquina precisam ser comprovados antes de fechar a issue.


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

Tudo vive em um único workflow — `.github/workflows/ci-cd.yml` — com CI e CD separados.

**CI** — roda em todo push (qualquer branch) e em todo Pull Request para a `main`:

1. **Build** (matriz `frontend`/`backend`): `npm ci`, `npx prisma generate` (backend),
   `npm run lint` (frontend) e `npm run build`
2. **Test** (matriz, após o Build): `npm test`
3. **Docker**: builda as imagens com o mesmo `infra/docker-compose.yml` do uso local, sobe a
   stack com `docker compose up --wait` (espera todos os containers ficarem `healthy`), confere
   `GET /health` da API e a página do frontend e salva as imagens validadas como
   artefato (`docker save`) para o CD — este último passo só em push na `main`
4. Em caso de falha, o resumo do job mostra qual etapa quebrou e a causa provável

**CD** — só roda depois que **todos** os jobs de CI passam, e só em push na `main`
(ou seja, após o merge de um PR). Em Pull Request o CD nunca roda.

1. Baixa o artefato do CI e faz `docker load` — **a imagem publicada é a mesma validada
   no CI**, sem rebuild
2. Login no Docker Hub com os secrets `DOCKERHUB_USERNAME` e `DOCKERHUB_TOKEN`
3. Calcula a versão: incrementa o patch da última tag `vX.Y.Z` do git (a primeira é `v1.0.0`)
4. Publica cada imagem com duas tags: a versão (`1.0.3`) e `latest`
5. Cria a tag `vX.Y.Z` no commit do merge — só depois do push, então toda tag criada pelo
   pipeline tem imagem correspondente no Docker Hub

**Rastreabilidade:** a imagem `1.0.3` no Docker Hub corresponde à tag Git `v1.0.3`.
Use a versão publicada em `IMAGE_TAG` para executar uma entrega específica.
Como a `main` exige PR aprovado, toda versão corresponde a um merge revisado.

Para subir **minor** ou **major**, crie a tag manualmente no último commit da `main`
(`git tag v1.1.0 && git push origin v1.1.0`); os próximos merges continuam a partir dela
(`v1.1.1`, `v1.1.2`...). O push de tag não dispara o pipeline, então a tag manual não tem
imagem própria — a primeira imagem da nova linha é a do merge seguinte (`1.1.1`).

**Automação de issues** — `.github/workflows/close-issue-on-merge.yml`
Quando um PR é mergeado, fecha automaticamente a issue cujo número aparece no nome da
branch (ex.: branch `feature-18` fecha a issue #18).

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
