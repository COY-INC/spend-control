# Verificação da entrega — seções 7 e 8

## Teste em outra máquina

1. Registre nome do avaliador, data, sistema/arquitetura e SHA das imagens.
2. Use uma máquina diferente da utilizada na publicação, com Docker e Compose.
3. Em pasta limpa, coloque somente `docker-compose.prod.yml` e `.env` (baseado em `.env.prod.example`). Não copie o código-fonte.
4. Execute os pulls sem credenciais. Em Linux/macOS, use uma configuração temporária vazia, sem encerrar sua sessão Docker habitual:

   ```bash
   docker_config_teste=$(mktemp -d)
   docker --config "$docker_config_teste" pull coyinc/spend-control-backend:latest
   docker --config "$docker_config_teste" pull coyinc/spend-control-frontend:latest
   ```

   Se usar sudo, aplique-o também a esses comandos. Guarde a saída com os digests; o token anônimo do registry não exige uma conta autenticada.
5. Execute `docker compose -f docker-compose.prod.yml up -d --no-build --wait --wait-timeout 180`.
6. Confira `ps`, `/health` e login no navegador com Marido/1234 e Esposa/5678. Verifique que o painel mostra dados.
7. Execute `down` e depois `up` novamente para verificar a persistência. Não use `-v` ao testar preservação dos dados.
8. Anexe evidências à issue e marque os itens abaixo somente após executar.

## Checklist completo da seção 8

- [ ] Repositório público e README completo: revisar acesso anônimo e todas as seções, incluindo registro de IA.
- [ ] Dockerfiles: bases Alpine com tags específicas, usuário não-root e ausência de segredos. Os arquivos atendem estruturalmente; conferir as imagens publicadas.
- [ ] Compose sobe tudo sem passos manuais de migrations/seed: validar do zero na máquina de avaliação.
- [ ] CI e CD separados, CD dependente do CI: estrutura presente; anexar execução verde.
- [ ] Credenciais do Docker Hub em GitHub Secrets: pipeline referencia os secrets; confirmar configuração no GitHub.
- [ ] Imagens públicas com tag rastreável: comprovar pulls anônimos de ambas e registrar SHA/digests.
- [x] README documenta os comandos para baixar e executar as imagens publicadas.

## Critérios desta issue

- [x] Compose de entrega independente do checkout, usando `image` em todos os serviços.
- [x] Seção 5 documenta pull, execução, login e alternativa com artifact.
- [ ] Pull anônimo concluído com Docker (ambas as imagens).
- [ ] Stack e login validados em pasta limpa.
- [ ] Teste realizado em outra máquina, com evidências anexadas.

Revisão documental não substitui a execução dos critérios. Não considerar esta lista prova de testes ainda não realizados.

## Evidência local — 26/09/2026

- `docker compose config` validado em diretório temporário contendo somente Compose e `.env`, sem build ou volumes do tipo bind.
- Consulta anônima ao registry (sem credenciais de conta) retornou HTTP 200 para os manifests `latest`:
  - Backend: `sha256:285ef15df2885fc25b6796782af8d439b72e20ecfa221a534edffbaf6e3f7623`.
  - Frontend: `sha256:bc70d9e18b4c2ae93129bbb1ae706e851aef8e5aee4ab8425d5d75612534ab6d`.
- Isso confirma acesso anônimo aos manifests naquela data, mas não o download completo das camadas.
- Execução dos containers não realizada: acesso local ao Docker depende de senha de sudo. Login e teste em outra máquina continuam pendentes.
