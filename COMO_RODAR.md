# Como rodar localmente

Guia completo pra subir o fin-dash do zero na sua máquina.

## Pré-requisitos
- **Node.js 22+** e npm
- **Docker Desktop** rodando (com virtualização ligada na BIOS: Intel VT-x / AMD SVM)
- Git Bash ou PowerShell

---

## 1. Instalar dependências (primeira vez)
```
cd backend  && npm install
cd frontend && npm install
```

## 2. Criar os arquivos `.env`
Os `.env` **não são versionados** — copie dos exemplos e preencha:
```
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env
```

### `backend/.env` (o que preencher pra rodar local)
| Variável | Valor local | Obrigatória? |
|---|---|---|
| `DATABASE_URL` | `postgresql://admin:adminpassword@localhost:5433/findb` | **Sim** (bate com o docker-compose) |
| `JWT_SECRET` | qualquer string forte (ex.: `dev-secret-troque`) | **Sim** — sem ela o login/rotas protegidas falham |
| `PLUGGY_MOCK` | `1` | Sim, pra rodar sem credenciais Pluggy |
| `PORT` | vazio (usa 3333) | Não |
| `CORS_ORIGIN` | vazio (usa `http://localhost:5173`) | Não |
| `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` | vazio no modo mock | Só pra Pluggy real |

> Exemplo mínimo do `backend/.env` pra rodar local com dados fake:
> ```
> DATABASE_URL="postgresql://admin:adminpassword@localhost:5433/findb"
> JWT_SECRET="dev-secret-troque"
> PLUGGY_MOCK=1
> ```

### `frontend/.env`
| Variável | Valor local | Obrigatória? |
|---|---|---|
| `VITE_API_URL` | vazio (usa `http://localhost:3333`) | Não |
| `VITE_PLUGGY_CONNECTOR_IDS` | vazio (ou `200` = Meu Pluggy) | Não |

Pra rodar local com mock, o `frontend/.env` pode ficar todo vazio (os fallbacks resolvem).

---

## 3. Subir o banco (Postgres via Docker)
```
docker compose -f infra/docker-compose.yml up -d
```
> Roda na porta **5433** do host (a 5432 costuma estar ocupada por um Postgres nativo do Windows).

## 4. Criar tabelas + dados fake (uma vez)
```
cd backend
npm run db:setup      # = prisma migrate deploy + seed (2 usuários com PIN, contas, transações)
```

## 5. Rodar a aplicação — **ordem de inicialização** (dois terminais)
```
# Terminal 1 — backend (subir ANTES do frontend)
cd backend && npm run dev      # API  -> http://localhost:3333

# Terminal 2 — frontend
cd frontend && npm run dev     # Web  -> http://localhost:5173
```

## 6. Entrar
Abra **http://localhost:5173** e faça login com PIN (vêm do seed):
- **Marido** → PIN `1234`
- **Esposa** → PIN `5678`

---

## Resumo da ordem (TL;DR)
1. `docker compose -f infra/docker-compose.yml up -d` (Postgres)
2. `cd backend && npm run db:setup` (tabelas + seed) — só na primeira vez / após mudar schema
3. `cd backend && npm run dev` (API :3333)
4. `cd frontend && npm run dev` (Web :5173)
5. Login em :5173 com Marido/`1234`

---

## Pluggy real (opcional)
Pra usar dados reais em vez do mock:
1. Pegue `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET` no [dashboard.pluggy.ai](https://dashboard.pluggy.ai).
2. No `backend/.env`: preencha as duas e **remova** `PLUGGY_MOCK`.
3. (Meu Pluggy gratuito) conecte seus bancos em [meu.pluggy.ai](https://meu.pluggy.ai) e use `VITE_PLUGGY_CONNECTOR_IDS=200` no `frontend/.env`.
4. Reinicie o backend.

## Testar o webhook/upsert (modo mock)
Com o server rodando (`PLUGGY_MOCK=1 npm run dev`) e o seed aplicado:
```
npm run webhook:mock      # 1ª vez -> created: 3
npm run webhook:mock      # 2ª vez -> updated: 3, created: 0  (não duplica)
```

## Mudanças de schema (dev)
Editou `prisma/schema.prisma`? Gere e aplique a migration:
```
cd backend && npm run db:migrate -- --name <nome-da-mudanca>
```

## Problemas comuns
- **`P1000 Authentication failed`** no Prisma → o `DATABASE_URL` não bate com o docker-compose, ou há um Postgres nativo na 5432. Confirme a porta **5433** e usuário/senha `admin`/`adminpassword`.
- **Login retorna 401 / erro de JWT** → `JWT_SECRET` faltando no `backend/.env`.
- **Frontend não acha a API** → confira que o backend subiu na 3333 antes; `VITE_API_URL` vazio cai no fallback `http://localhost:3333`.
