# Verificação da entrega — seções 7 e 8

## Teste em outra máquina

1. Registre nome do avaliador, data, sistema/arquitetura e SHA das imagens.
2. Use uma máquina diferente da utilizada na publicação, com Docker e Compose.
3. Em pasta limpa, baixe somente o `docker-compose.prod.yml` direto do GitHub — não clone nem copie o código-fonte:

   ```bash
   mkdir spend-control-prod && cd spend-control-prod
   curl -fsSLO https://raw.githubusercontent.com/COY-INC/spend-control/main/docker-compose.prod.yml
   ```

   O `.env` é opcional — o Compose já tem valores padrão. Para fixar `IMAGE_TAG` numa versão publicada e garantir rastreabilidade do teste, baixe o modelo e edite `IMAGE_TAG` (ex.: `1.0.14`):

   ```bash
   curl -fsSL -o .env https://raw.githubusercontent.com/COY-INC/spend-control/main/.env.prod.example
   ```

4. Execute os pulls sem credenciais. Em Linux/macOS, use uma configuração temporária vazia, sem encerrar sua sessão Docker habitual:

   ```bash
   docker_config_teste=$(mktemp -d)
   docker --config "$docker_config_teste" pull coyinc/spend-control-backend:latest
   docker --config "$docker_config_teste" pull coyinc/spend-control-frontend:latest
   ```

   Se usar sudo, aplique-o também a esses comandos. Guarde a saída com os digests; o token anônimo do registry não exige uma conta autenticada.
5. Execute `docker compose -f docker-compose.prod.yml up -d --wait --wait-timeout 180`. Se a máquina já subiu a stack de entrega antes, o volume `spend-control-prod_db-data` é reaproveitado: para testar com banco novo, use `-p <outro-nome>` ou rode `down -v` antes (ver Troubleshooting do README).
6. Confira `ps`, `/health` e login no navegador com Marido/1234 e Esposa/5678. Verifique que o painel mostra dados.
7. Execute `down` e depois `up` novamente para verificar a persistência. Não use `-v` ao testar preservação dos dados.
8. Anexe evidências à issue e marque os itens abaixo somente após executar.

## Checklist completo da seção 8

- [x] Repositório público e README completo: acesso anônimo confirmado. Todas as seções revisadas:
  - §1 a §10: todas presentes e documentadas
  - §8 (Variáveis de ambiente): valores padrão, `.env` e `.example` versionados corretamente
  - §9 (Uso de IA): tabela de registro de IA (seção mergeada no #62)
  - README atualizado com documentação de volume reaproveitado (§5) e troubleshooting (§10)
- [x] Dockerfiles: bases Alpine com tags específicas, usuário não-root e ausência de segredos. Evidência de inspeção das imagens `1.0.14`:
  - **Backend:** `/app` contém apenas `dist`, `dist-seed`, `prisma`, `node_modules`, `package*.json`, `docker-entrypoint.sh`. Sem `.env`, `.git`, chaves privadas ou credenciais. `NODE_ENV=production`. Usuário: `node`.
  - **Frontend:** somente build estático (`index.html`, `assets/`, ícones, `50x.html`). Usuário: `nginx`.
  - **Certificados:** únicos `.pem` encontrados são certificados públicos de CA do Alpine. `.npmrc` presente é vazio (padrão da imagem base).
- [x] Compose sobe tudo sem passos manuais de migrations/seed: validado do zero em clone limpo, pasta vazia, sem `.env`. Migrations e seed rodadas automaticamente. Evidência: 01/10/2026 (§4 e §5).
- [x] CI e CD separados, CD dependente do CI: job `CD (publish Docker Hub)` com `needs: [build, test, docker]`; execução verde na `main` para `7c0de4d` (publicou a `1.0.14`) em [36849052557](https://github.com/COY-INC/spend-control/actions/runs/36849052557).
- [x] Credenciais do Docker Hub em GitHub Secrets: `DOCKERHUB_USERNAME` e `DOCKERHUB_TOKEN` configurados (`gh secret list`), referenciados em `ci-cd.yml`.
- [x] Imagens públicas com tag rastreável: pulls anônimos de `latest` e `1.0.14` (mesmo digest; tag Git `v1.0.14` ↔ `7c0de4d`), digests na evidência de 01/10 abaixo.
- [x] README documenta os comandos para baixar e executar as imagens publicadas.

## Critérios desta issue

- [x] Compose de entrega independente do checkout, usando `image` em todos os serviços.
- [x] Seção 5 documenta pull, execução e login. A alternativa com artifact do CI (opcional no guia) não é documentada: as imagens são públicas no Docker Hub, e o artifact `images-<sha>` exige login no GitHub e expira em 7 dias.
- [x] Pull anônimo concluído com Docker (ambas as imagens).
- [x] Stack e login validados em pasta limpa.
- [ ] Teste realizado em outra máquina, com evidências anexadas. Realizado pela equipe em 01/10/2026 em macOS; falta registrar na seção "Teste em outra máquina — 01/10/2026" abaixo o avaliador, as versões exatas, a versão testada e a evidência, para então marcar este item.

Revisão documental não substitui a execução dos critérios. Não considerar esta lista prova de testes ainda não realizados.

## Evidência — 01/10/2026 (máquina de desenvolvimento)

- **Ambiente:** máquina de desenvolvimento (execução assistida por Claude Code) — Linux 6.8 x86_64, Docker 29.8.0, Docker Compose v5.5.1, Node 22.18.0 (`nvm install`, lendo o `.nvmrc`). Não é o "computador limpo"; o teste em outra máquina está na seção seguinte.
- **Versão testada:** `latest` = `1.0.14` = tag Git `v1.0.14` = commit `7c0de4d` (merge do PR #61). Pipeline verde: [run 36849052557](https://github.com/COY-INC/spend-control/actions/runs/36849052557).
- **Digests** (`latest` e `1.0.14` iguais):
  - Backend: `coyinc/spend-control-backend@sha256:7667b2b32e0a2f862cf32d37946b3856a25a67729ac33dec929ead20c8c4c26a`
  - Frontend: `coyinc/spend-control-frontend@sha256:a4bdd4ad15a347a97295631896699698632700dedaa85aff51b6eb49fb26cc53`
- Para não reaproveitar volumes já existentes na máquina, os testes usaram nomes de projeto próprios (`-p scval-dev` e `-p scval-prod`); fora isso, os comandos são os do README. Login e dados foram conferidos pela API (`/auth/login` + `/accounts` e `/transactions` com o token), não pelo navegador.

**§4 — Docker Compose com build local (`git clone` da `main`, sem `.env`)**
- `docker compose up --build --wait`: `db`, `backend` e `frontend` `healthy` em ~32 s.
- `/health` → `200 {"status":"ok"}`; `:8080` → 200; o bundle do frontend aponta para `http://localhost:3333`.
- Login de Marido/1234 e Esposa/5678 OK; cada usuário com 6 contas e 359 transações (seed mock automático).
- CORS: preflight de `http://localhost:8080` → `Access-Control-Allow-Origin: http://localhost:8080`.

**§3 — Modo desenvolvimento (passos 1 a 5 do README)**
- `npm ci` em `backend/` e `frontend/`, cópia dos `.env.example`, `docker compose up -d --wait db`, `npm run db:setup` (seed: 2 usuários, 4 contas).
- `npm run dev`: API em `:3333` (`/health` 200) e Vite em `:5173` (200).
- Login de Marido/1234 e Esposa/5678 OK; cada usuário com 4 contas e 40 transações.
- CORS: preflight de `http://localhost:5173` → permitido.

**§6 — Testes**
- `npm test` na raiz (após `npx prisma generate` no backend): backend 9/9, frontend 6 suítes / 23 testes, saída 0.

**§5 — Imagem publicada (pasta vazia, só o Compose via `curl`, sem `.env`)**
- Pull anônimo com `docker --config "$(mktemp -d)" pull` das duas imagens `latest`: `Downloaded newer image`.
- `docker compose -f docker-compose.prod.yml up -d --wait --wait-timeout 180`: 3 serviços `healthy` em ~17 s; `/health` e `:8080` → 200.
- Login de Marido/1234 e Esposa/5678 OK; 6 contas e 359 transações por usuário.
- Persistência: `down` (sem `-v`) e `up` → mesmos IDs de usuário.
- `.env` opcional baixado de `.env.prod.example` com `IMAGE_TAG=1.0.14`: stack recriada com `:1.0.14`, `healthy`.

**Segredos nas imagens `1.0.14`** — inspeção com `docker run --rm --entrypoint sh` (`find` por `.env*`, `.git`, `*.pem`, `id_rsa*`, `.npmrc`) e `docker image inspect` (variáveis de ambiente): resultado no item "Dockerfiles" do checklist acima.

## Teste em outra máquina — 01/10/2026

> Preencher com os dados de quem executou e marcar o critério "Teste realizado em outra máquina" acima.

- **Avaliador:** _(nome)_
- **Ambiente:** macOS _(versão exata)_, _(arquitetura: arm64/x86_64)_, Docker _(versão exata)_, Docker Compose _(versão exata)_
- **Versão testada:** `IMAGE_TAG` _(ex.: `1.0.14` ou `latest` = `1.0.14`)_ e digests obtidos no pull
- **Cenários executados:** _(ex.: §5 pasta vazia sem `.env`; §4 clone limpo; login no navegador)_
- **Evidências:** _(link para prints/logs anexados na issue #66)_

## Evidência local — 26/09/2026

- `docker compose config` validado em diretório temporário contendo somente Compose e `.env`, sem build ou volumes do tipo bind.
- Consulta anônima ao registry (sem credenciais de conta) retornou HTTP 200 para os manifests `latest`:
  - Backend: `sha256:285ef15df2885fc25b6796782af8d439b72e20ecfa221a534edffbaf6e3f7623`.
  - Frontend: `sha256:bc70d9e18b4c2ae93129bbb1ae706e851aef8e5aee4ab8425d5d75612534ab6d`.
- Isso confirma acesso anônimo aos manifests naquela data, mas não o download completo das camadas.
- Execução dos containers não realizada: acesso local ao Docker depende de senha de sudo. Login e teste em outra máquina continuam pendentes.

## Evidência — 30/09/2026

- **Avaliador:** Tibet Teixeira (execução assistida por Claude Code), na máquina de desenvolvimento — não é a máquina de publicação (o CD roda no GitHub Actions), mas também não é um "computador limpo": as camadas base Alpine já estavam em cache.
- **Ambiente:** Linux 6.8 x86_64 (amd64), Docker 29.8.0, Docker Compose v5.5.1, Node 22.18.0.
- **Versão testada:** `IMAGE_TAG` padrão (`latest`) = `1.0.9` = tag Git `v1.0.9` = commit `7a7a01d` (merge do PR #57).
- **Pipeline:** CI/CD verde na `main` para `7a7a01d` — [run 36246824307](https://github.com/COY-INC/spend-control/actions/runs/36246824307) (Build, Test, Docker e `CD (publish Docker Hub)` com sucesso).

1. **Pull anônimo** — imagens locais removidas antes; `docker --config "$(mktemp -d)" pull` de `latest` e `1.0.9`, ambas baixadas (`Downloaded newer image`), mesmo digest por imagem:
   - Backend: `sha256:5a228967309132fde43c12447e459d25ae821324e21277f35b8cba7cf3ffe13e`
   - Frontend: `sha256:ab3119a448da398f61443fb9b9c21e42a2c6872000898e4824c1180f63edb6c9`
2. **Imagem publicada em pasta limpa, sem `.env`** — pasta contendo só o `docker-compose.prod.yml` baixado via `curl` da `main`; `up -d --wait --wait-timeout 180` com volume novo: `db`, `backend` e `frontend` `healthy` em ~17 s, migrations e seed automáticos. `/health` → `200 {"status":"ok"}`, `:8080` → 200. Login via API de Marido/1234 e Esposa/5678 OK, 360 transações e saldo consolidado R$ 102.340,66. Login no navegador (Marido) abriu o painel com dados.
3. **Persistência** — criada uma transação manual marcadora, `down` (sem `-v`) e `up`: a transação e os IDs dos usuários continuaram iguais (361 transações).
4. **Build local em clone limpo, sem `.env`** — `git clone` da `main` (`7a7a01d`) e `docker compose up -d --build --wait`, também com `build --no-cache --pull`: os três serviços `healthy`, `/health` 200, frontend em `:8080` e login de ambos os usuários OK.
5. **Testes** — no clone limpo, pré-requisitos da seção 6 do README + `npm test` na raiz: backend 8/8, frontend 6 suítes / 23 testes, saída 0.

**Achado:** o `docker-compose.prod.yml` fixa `name: spend-control-prod`, então "pasta limpa" não implica banco limpo — se o volume `spend-control-prod_db-data` já existir na máquina (testes anteriores), ele é reaproveitado e o seed não roda do zero. Para um teste do zero, usar `docker compose -p <outro-nome> ...` ou remover o volume antes (`down -v`). Vale registrar no Troubleshooting do README em issue própria.
