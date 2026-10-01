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

- [x] Repositório público e README completo: revisar acesso anônimo e todas as seções, incluindo registro de IA. Repositório `public` (API do GitHub sem autenticação, 30/09); seção 9 (IA) entra com #48.
- [ ] Dockerfiles: bases Alpine com tags específicas, usuário não-root e ausência de segredos. Conferido nas imagens `1.0.9`: Alpine (backend 3.22, frontend 3.21), usuário `node`/`nginx`; `.env*` no `.dockerignore`. Falta inspecionar o conteúdo das imagens publicadas quanto a segredos.
- [x] Compose sobe tudo sem passos manuais de migrations/seed: validado do zero (volume novo) com a imagem publicada e com `up --build` em clone limpo.
- [x] CI e CD separados, CD dependente do CI: job `CD (publish Docker Hub)` com `needs: [build, test, docker]`; execução verde na `main` em [36246824307](https://github.com/COY-INC/spend-control/actions/runs/36246824307).
- [x] Credenciais do Docker Hub em GitHub Secrets: `DOCKERHUB_USERNAME` e `DOCKERHUB_TOKEN` configurados (`gh secret list`), referenciados em `ci-cd.yml`.
- [x] Imagens públicas com tag rastreável: pulls anônimos de `latest` e `1.0.9` (tag Git `v1.0.9` ↔ `7a7a01d`), digests abaixo.
- [x] README documenta os comandos para baixar e executar as imagens publicadas.

## Critérios desta issue

- [x] Compose de entrega independente do checkout, usando `image` em todos os serviços.
- [x] Seção 5 documenta pull, execução e login. A alternativa com artifact do CI (opcional no guia) não é documentada: as imagens são públicas no Docker Hub, e o artifact `images-<sha>` exige login no GitHub e expira em 7 dias.
- [x] Pull anônimo concluído com Docker (ambas as imagens).
- [x] Stack e login validados em pasta limpa.
- [ ] Teste realizado em outra máquina, com evidências anexadas. A execução de 30/09 foi na máquina de desenvolvimento (as imagens são publicadas pelo runner do GitHub Actions, mas não é um "computador limpo"); falta repetir numa máquina de outra pessoa.

Revisão documental não substitui a execução dos critérios. Não considerar esta lista prova de testes ainda não realizados.

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
