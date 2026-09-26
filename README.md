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
| Testes | Jest + Testing Library (frontend), test runner nativo do Node via `tsx --test` (backend) |
| Containers | Docker (multi-stage, usuário não-root), Docker Compose |
| CI/CD | GitHub Actions → imagens publicadas no Docker Hub |

**Estrutura do repositório**

```
spend-control/
├── backend/                 API REST (Express + Prisma) + Dockerfile
├── frontend/                SPA React (Vite) + Dockerfile (Nginx)
├── docker-compose.yml       stack de desenvolvimento (build local) + .env.example
├── docker-compose.prod.yml  stack de entrega (imagens publicadas) + .env.prod.example
├── docs/                    checklist de entrega e documentos de apoio
└── .github/                 workflows (CI/CD e automação de issues)
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

## 3. Como rodar localmente (modo desenvolvimento)

Backend e frontend rodam direto no Node, com recarga automática ao salvar; só o banco
roda em Docker. Para subir tudo em containers, veja a [seção 4](#4-como-rodar-com-docker-compose).

**Pré-requisitos**
- **Node.js 22** — o CI usa a `22.18.0` (arquivo `.nvmrc`). Com nvm:
  `nvm install` (Linux/macOS — lê o `.nvmrc`, instala se faltar e ativa) ou
  `nvm install 22.18.0 && nvm use 22.18.0` (Windows, nvm-windows)
- **Docker Desktop aberto** (para o PostgreSQL)
- No Windows, use o **Git Bash** — os comandos abaixo são de terminal bash

Todos os comandos partem da **raiz do repositório**.

**1. Instalar as dependências**

```bash
(cd backend && npm ci)
(cd frontend && npm ci)
```

**2. Criar os arquivos `.env`** — os exemplos já vêm com valores que funcionam localmente
(banco do Docker, JWT de desenvolvimento e Pluggy em modo mock):

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

**3. Subir só o banco** (PostgreSQL na porta `5433` do host; o `docker-compose.yml` da raiz
já tem valores padrão, não precisa de `.env`):

```bash
docker compose up -d --wait db
```

> Não esqueça o `db` no final: sem ele o Compose sobe também o backend em container,
> que disputa a porta 3333 com o `npm run dev` (ver [Troubleshooting](#10-troubleshooting)).

**4. Criar as tabelas e os dados de exemplo** (primeira vez, ou para zerar os dados):

```bash
(cd backend && npm run db:setup)
```

**5. Rodar** — dois terminais, os dois abertos na raiz do repositório:

```bash
# Terminal 1 — API em http://localhost:3333
cd backend && npm run dev
```

Confira se a API subiu antes de abrir o frontend — deve responder `{"status":"ok"}`:

```bash
curl http://localhost:3333/health
```

```bash
# Terminal 2 — frontend em http://localhost:5173
cd frontend && npm run dev
```

**6. Entrar** — abra **http://localhost:5173** e use um dos usuários do seed:
**Marido → PIN `1234`** · **Esposa → PIN `5678`**.

**Para encerrar:** `Ctrl+C` nos dois terminais e `docker compose stop db`.
Os dados ficam no volume e voltam no próximo `up`.

> Para um banco com muito mais dados (6 meses de transações, faturas, parcelas,
> investimentos), use `npm run db:setup:mock` no passo 4 — detalhes em
> [COMO_RODAR_MOCK.md](./COMO_RODAR_MOCK.md).

**Pluggy real (opcional):** preencha `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`
(de [dashboard.pluggy.ai](https://dashboard.pluggy.ai)) no `backend/.env`, apague a linha
`PLUGGY_MOCK=1` e reinicie o backend.

---

## 4. Como rodar com Docker Compose

Sobe **frontend + API + PostgreSQL**, com migrations automáticas e healthchecks.
O modo Pluggy mock está habilitado, sem exigir credenciais externas.

> O `docker-compose.yml` mudou de `infra/docker-compose.yml` para a raiz do projeto e passou
> a se chamar explicitamente `spend-control` (`name:` no arquivo). Quem já tinha subido a
> stack antes verá um volume novo (`spend-control_db-data`, antes `infra_db-data`) — o banco
> de desenvolvimento local será recriado do zero (populado pelo seed mock automático).

```bash
git clone https://github.com/COY-INC/spend-control.git
cd spend-control
docker compose up --build --wait
```

- **Frontend** → http://localhost:8080
- **API / saúde** → http://localhost:3333/health
- **Banco para ferramentas locais** → `localhost:5433` (usuário `admin`, senha `adminpassword`, banco `findb`)

Todas as variáveis têm um valor padrão de exemplo no próprio `docker-compose.yml` — não é
preciso criar nenhum arquivo para rodar. Para sobrescrever algum valor, copie `.env.example`
para `.env` na raiz do projeto (lido automaticamente pelo Compose) e ajuste o que quiser.
Variáveis exportadas no terminal têm prioridade sobre o arquivo. O `backend/.env` não é
carregado por este Compose. Ao alterar a porta externa da API ou do frontend, ajuste também
`VITE_API_URL` e `CORS_ORIGIN`, conforme necessário, e repita o comando com `--build`. A URL
da API é incorporada ao build do frontend; a API usa `db:5432` na rede interna, enquanto o
navegador usa `localhost`.

Para verificar os serviços e os logs:

```bash
docker compose ps
curl --fail http://localhost:3333/health
curl --fail http://localhost:8080/
docker compose logs --tail=100
```

Em modo mock, o backend carrega dados de exemplo automaticamente após as migrations
quando não há usuários no banco. Reinícios preservam os dados existentes.
Login de exemplo: **Marido / PIN 1234** ou **Esposa / PIN 5678**.

Para recriar os exemplos manualmente (**apaga os dados atuais**):

```bash
docker compose exec backend npm run seed:mock:dist
```

Para encerrar, use `docker compose down`. O volume `db-data` preserva os dados; adicionar
`-v` apaga o banco. Se uma porta estiver ocupada, altere a respectiva variável no `.env`
(veja `.env.example`). Se houver erro de permissão no socket Docker em Linux, execute os
comandos com `sudo` no seu terminal.

---

## 5. Como rodar a partir da imagem publicada

O arquivo `docker-compose.prod.yml`, na raiz, usa somente imagens publicadas,
sem `build`, bind mounts ou dependência do código-fonte. O PostgreSQL fica na rede
interna, com volume persistente. Este fluxo é para avaliação local em modo mock.

Em uma pasta vazia, coloque apenas `docker-compose.prod.yml`. Todas as variáveis têm um
valor padrão de exemplo no próprio arquivo — não é preciso criar `.env` para rodar. Para
sobrescrever algum valor (por exemplo, fixar uma versão em `IMAGE_TAG`), copie
`.env.prod.example` para `.env` na mesma pasta e ajuste o que quiser.

O CD publica duas imagens no Docker Hub, cada uma com duas tags: a versão (`1.0.3`) e
`latest`. As versões disponíveis estão nas
[tags do repositório](https://github.com/COY-INC/spend-control/tags).

```bash
docker pull coyinc/spend-control-backend:latest
docker pull coyinc/spend-control-frontend:latest
docker compose -f docker-compose.prod.yml up -d --no-build --wait --wait-timeout 180
```

A API publica `http://localhost:3333` e o frontend `http://localhost:8080`.
Mantenha `API_PORT=3333` para a imagem publicada: esse endereço está incorporado ao frontend.
Libere essas portas antes de iniciar (encerre a stack de desenvolvimento, se necessário).
As migrations e o seed mock rodam automaticamente em um banco novo.
Entre com **Marido / PIN 1234** ou **Esposa / PIN 5678** e confira os dados no painel.
O healthcheck confirma disponibilidade; o login no navegador valida a integração.

```bash
docker compose -f docker-compose.prod.yml ps
curl --fail http://localhost:3333/health
curl --fail http://localhost:3333/auth/users
docker compose -f docker-compose.prod.yml logs --tail=100
```

Para usar uma versão rastreável, defina `IMAGE_TAG` no `.env` com uma versão publicada
(por exemplo, `1.0.3`, sem o prefixo `v` da tag Git),
execute `docker compose -f docker-compose.prod.yml pull` e repita o `up`.
`DOCKERHUB_NAMESPACE` permite selecionar a conta que publicou as imagens;
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `JWT_SECRET`,
`PLUGGY_MOCK`, `API_PORT`, `FRONTEND_PORT` e `CORS_ORIGIN` têm padrão no
`docker-compose.prod.yml` e podem ser sobrescritas pelo `.env`.
Mantenha as credenciais de `DATABASE_URL` consistentes com as do PostgreSQL.
Alterar essas credenciais no arquivo não altera usuários de um volume já inicializado.

Encerre com `docker compose -f docker-compose.prod.yml down`. Os dados persistem
no volume do projeto `spend-control-prod`; `down -v` apaga esses dados.

**Aceite e evidências:** siga [o checklist de entrega](docs/entrega-containers.md).
A publicação pública e o teste em outra máquina precisam ser comprovados antes de fechar a issue.


---

## 6. Como rodar os testes

**Pré-requisito** — Node.js 22 (`nvm use` na raiz) e, uma vez só, se ainda não feito:

```bash
cd backend && npm ci && npx prisma generate && cd ..
cd frontend && npm ci && cd ..
```

**Comando único** — na raiz do repositório, roda os testes do backend e do frontend:

```bash
npm test
```

Um teste quebrado em qualquer um dos pacotes faz o comando sair com código ≠ 0.

Para rodar só um lado:

- **Backend** (test runner nativo do Node via `tsx --test`, todos os `*.test.ts` em `src/`):

  ```bash
  cd backend && npm test
  ```

- **Frontend** (Jest + Testing Library):

  ```bash
  cd frontend && npm test
  ```

---

## 7. Pipeline CI/CD

As execuções ficam na aba **[Actions](https://github.com/COY-INC/spend-control/actions)** do GitHub.

Tudo vive em um único workflow — `.github/workflows/ci-cd.yml` — com CI e CD separados.

**CI** — roda em todo push (qualquer branch) e em todo Pull Request para a `main`:

1. **Build** (matriz `frontend`/`backend`): `npm ci`, `npx prisma generate` (backend),
   `npm run lint` (frontend) e `npm run build`
2. **Test** (matriz, após o Build): `npm test`
3. **Docker**: builda as imagens com o mesmo `docker-compose.yml` do uso local, sem `.env`
   (valida os valores padrão), sobe a stack com `docker compose up --wait` (espera todos os
   containers ficarem `healthy`), confere `GET /health` da API e a página do frontend e salva
   as imagens validadas como artefato (`docker save`) para o CD — este último passo só em
   push na `main`
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

**Fluxo de trabalho (GitHub Flow):** issue → branch curta `feature-<nº>` ou `bug-<nº>` a partir
da `main` → Pull Request `ISSUE-<nº> - título` → CI verde + 1 aprovação → merge.
Detalhes em [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 8. Variáveis de ambiente

Os valores reais ficam em arquivos `.env`, que **não são versionados**. Cada arquivo tem
um modelo `.example` versionado, com valores que funcionam localmente (nunca segredos reais):

| Arquivo | Usado por | Modelo |
|---|---|---|
| `backend/.env` | Backend rodando com `npm run dev` (seção 3) | `backend/.env.example` |
| `frontend/.env` | Frontend rodando com `npm run dev` (seção 3) | `frontend/.env.example` |
| `.env` (raiz) | Compose de desenvolvimento (seções 3 e 4) — opcional, o Compose já tem padrões | `.env.example` |
| `.env` (pasta do compose de entrega) | Compose de produção (seção 5) — opcional, idem | `.env.prod.example` |

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

**Docker Compose** (`.env` de desenvolvimento e `.env` de produção)

Todas têm valor padrão de exemplo no próprio Compose — o `.env` é opcional, só para
sobrescrever algum valor.

| Variável | Para que serve | Valor de exemplo |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Usuário, senha e nome do banco criados no primeiro `up` | `admin` / `adminpassword` / `findb` |
| `DATABASE_URL` | Conexão da API com o banco — usa o serviço `db` e a porta **interna** 5432; as credenciais devem bater com as acima | `postgresql://admin:adminpassword@db:5432/findb` |
| `JWT_SECRET` | Segredo dos tokens de login | `local-development-only-change-me` |
| `PLUGGY_MOCK` | `1` usa o stub da Pluggy e carrega dados de exemplo em banco vazio | `1` |
| `API_PORT` / `FRONTEND_PORT` | Portas publicadas no host (`127.0.0.1`) | `3333` / `8080` |
| `DB_PORT` | Porta do banco no host — só no compose de desenvolvimento | `5433` |
| `CORS_ORIGIN` | Origens liberadas no CORS da API | `http://localhost:8080,http://127.0.0.1:8080` |
| `VITE_API_URL` | URL da API fixada no build do frontend — só no compose de desenvolvimento | `http://localhost:3333` |
| `DOCKERHUB_NAMESPACE` | Conta do Docker Hub de onde vêm as imagens — só em produção | `coyinc` |
| `IMAGE_TAG` | Versão das imagens publicadas (`latest` ou ex.: `1.0.3`) — só em produção | `latest` |

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
conectando nele, com outro usuário e senha. Por isso o banco do `docker-compose.yml`
é publicado na porta **5433**. Confira se o `DATABASE_URL` usa `localhost:5433` e
usuário/senha `admin`/`adminpassword`.

**Login retorna 401 / erro de JWT**
A variável `JWT_SECRET` não está definida no `backend/.env`. Sem ela a API não consegue
assinar nem validar tokens.

**Frontend não carrega dados ("não acha a API")**
O backend precisa estar rodando antes do frontend, na porta 3333. Com `VITE_API_URL` vazio o
frontend usa `http://localhost:3333`; se mudar a porta da API, ajuste essa variável e
também o `CORS_ORIGIN` do backend.

**`db:setup` falha com `Environment variable not found: DATABASE_URL`**
O `backend/.env` não existe ou está vazio. Rode o passo 2 da seção 3
(`cp backend/.env.example backend/.env`).

**Docker: `failed to connect to the docker API` / `open //./pipe/dockerDesktopLinuxEngine`**
O Docker Desktop não está aberto. Abra-o, espere ele indicar que está em execução e repita o comando.

**`nvm use` não funciona no Windows**
O nvm-windows não lê o `.nvmrc`. Informe a versão: `nvm install 22.18.0 && nvm use 22.18.0`.
