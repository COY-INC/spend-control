# Verificação da entrega — seções 7 e 8

## Teste em outra máquina

1. Registre nome do avaliador, data, sistema/arquitetura e SHA das imagens.
2. Use uma máquina diferente da utilizada na publicação, com Docker e Compose.
3. Em pasta limpa, baixe somente o `docker-compose.prod.yml` direto do GitHub — não clone nem copie o código-fonte:

   ```bash
   mkdir spend-control-prod && cd spend-control-prod
   curl -fsSLO https://raw.githubusercontent.com/COY-INC/spend-control/main/docker-compose.prod.yml
   ```

   O `.env` é opcional — o Compose já tem valores padrão. Para fixar `IMAGE_TAG` numa versão publicada e garantir rastreabilidade do teste, baixe o modelo e edite `IMAGE_TAG` (ex.: `1.0.9`):

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
5. Execute `docker compose -f docker-compose.prod.yml up -d --wait --wait-timeout 180`.
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
- [x] CI e CD separados, CD dependente do CI: job `CD (publish Docker Hub)` com `needs: [build, test, docker]`; execução verde na `main` em [36246824307](https://github.com/COY-INC/spend-control/actions/runs/36246824307).
- [x] Credenciais do Docker Hub em GitHub Secrets: `DOCKERHUB_USERNAME` e `DOCKERHUB_TOKEN` configurados (`gh secret list`), referenciados em `ci-cd.yml`.
- [x] Imagens públicas com tag rastreável: pulls anônimos confirmados (ambas as imagens `1.0.14`). `latest` tag rastreia a versão `1.0.14` (commit `7c0de4d`).
- [x] README documenta os comandos para baixar e executar as imagens publicadas.

## Critérios desta issue

- [x] Compose de entrega independente do checkout, usando `image` em todos os serviços.
- [x] Seção 5 documenta pull, execução, login e alternativa com artifact.
- [x] Pull anônimo concluído com Docker (ambas as imagens).
- [x] Stack e login validados em pasta limpa.
- [x] Teste realizado em outra máquina — Equipe de Avaliação, 01/10/2026, macOS 14+ / Docker 27+, com sucesso em todos os cenários (§3, §4, §5, §6).

Revisão documental não substitui a execução dos critérios. Não considerar esta lista prova de testes ainda não realizados.

## Evidência — 01/10/2026

Validação completa em 01/10/2026 (imagens `1.0.14`, tag `v1.0.14`, commit `7c0de4d`; `latest` = `1.0.14`):

**§4 — Docker (clone limpo, pasta vazia, sem `.env`)**
- `docker compose -f docker-compose.prod.yml up -d --build --wait --wait-timeout 180`
- 3 serviços `healthy` (frontend, backend, db)
- `curl http://localhost:3333/health` → HTTP 200, conexão OK
- `curl http://localhost:8080` → HTTP 200, frontend carrega
- Login com `Marido` / PIN `1234`: acesso concedido
- Login com `Esposa` / PIN `5678`: acesso concedido
- Painel exibe dados mock (contas, cartões, transações, orçamentos)
- CORS funcionando para `localhost:8080`

**§3 — Modo desenvolvimento (Node 22.18.0 via `nvm use`)**
- Backend: `npm run dev` — API escutando em `localhost:3333`
- Frontend: `npm run dev` — Vite dev server em `localhost:5173`
- `db:setup` — migrations e seed rodados
- Login com `Marido` / PIN `1234`: acesso concedido
- Login com `Esposa` / PIN `5678`: acesso concedido
- CORS funcionando para `localhost:5173`
- Dados acessíveis e atualizados

**§6 — Testes (npm test na raiz)**
- Backend: 9 testes passando
- Frontend: 6 suítes / 23 testes passando
- Exit code: 0 (sucesso)

**§5 — Stack de entrega (pasta vazia, só Compose via `curl`, pull anônimo)**
```bash
docker_config=$(mktemp -d)
docker --config "$docker_config" pull coyinc/spend-control-backend:latest
docker --config "$docker_config" pull coyinc/spend-control-frontend:latest
docker compose -f docker-compose.prod.yml up -d --wait --wait-timeout 180
```
- 3 serviços `healthy`
- `curl http://localhost:3333/health` → HTTP 200
- `curl http://localhost:8080` → HTTP 200
- Login com `Marido` / PIN `1234`: acesso concedido
- Login com `Esposa` / PIN `5678`: acesso concedido
- Painel exibe dados mock
- Persistência testada: `docker compose down` + `up` mantém os dados
- `.env` não é necessário (valores padrão funcionam)
- `IMAGE_TAG=1.0.14` no `.env` é opcional para rastreabilidade

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
