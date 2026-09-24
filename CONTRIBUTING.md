# Guia de contribuição

Este documento descreve o fluxo de trabalho do repositório `spend-control`: como abrir issues, nomear branches, escrever commits e submeter pull requests.

## 1. Issue primeiro

Todo trabalho (feature, bug, chore) começa por uma issue no GitHub, com uma descrição clara do que precisa ser feito e por quê. Use os labels existentes (`feature`, `bug`, `chore`, `documentation`, ...) para classificar. Ao abrir a issue pela interface do GitHub, os templates em `.github/ISSUE_TEMPLATE/` já guiam o preenchimento.

## 2. Branch a partir da `main`

Crie a branch sempre a partir da `main` atualizada, com o nome no formato:

- `feature-<numero-da-issue>` — para novas funcionalidades/melhorias/chores
- `bug-<numero-da-issue>` — para correções de bugs

Exemplo: issue #12 → branch `feature-12`.

> Não use o slug automático que o botão "Create a branch" do GitHub sugere (ex.: `12-titulo-da-issue`) — a action `close-issue-on-merge.yml` extrai o número da issue a partir do **primeiro número encontrado no nome da branch**, então o padrão `feature-N`/`bug-N` é o que garante o fechamento automático correto.

## 3. Commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/): `tipo: descrição` (a descrição pode ser em português).

Tipos usados no projeto: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `ci`, `perf`, `style`.

Commits pequenos e coesos são preferíveis a um commit gigante no fim da branch.

## 4. Pull Request para `main`

- Abra o PR usando o template (`.github/PULL_REQUEST_TEMPLATE.md`).
- O título do PR deve seguir o formato `ISSUE-<numero> - <titulo descritivo do PR>`, onde `<numero>` é o número da issue relacionada (ex.: `ISSUE-11 - Adiciona regra de título de PR ao CONTRIBUTING`).
- Referencie a issue com `Closes #<numero>` na descrição — isso fecha a issue automaticamente quando o GitHub processa o merge, **além** da action `close-issue-on-merge.yml` (que fecha e comenta a issue com base no número extraído do nome da branch). As duas coisas são redundantes de propósito: se uma falhar, a outra garante o fechamento.
- O PR só pode ser mergeado quando:
  - A pipeline de CI (`ci.yaml`) passar tanto no job `frontend` quanto no job `backend` (install, testes, build).
  - Houver **pelo menos 1 aprovação** de revisão.
- Mantenha a branch atualizada com a `main` (merge ou rebase) antes de pedir review e antes do merge final, para evitar conflitos e reduzir o risco de a CI passar na branch mas falhar depois do merge.
- Prefira PRs pequenos e focados em uma única issue — não misture funcionalidades não relacionadas no mesmo PR.
- Abra como **Draft PR** enquanto o trabalho ainda não está pronto para review.

## 5. Merge e limpeza

- Após aprovado e com CI verde, o PR é mergeado na `main`.
- A issue correspondente é fechada automaticamente (`close-issue-on-merge.yml`).
- **Boa prática (não obrigatória):** apague a branch de origem (`feature-*`/`bug-*`) depois do merge, manualmente pelo botão "Delete branch" do GitHub ou com `git push origin --delete <branch>`.

## 6. Boas práticas adicionais

- **Nunca commitar segredos/`.env`** — apenas `.env.example` com placeholders. Se uma variável de ambiente nova for necessária, atualize o `.env.example` no mesmo PR.
- **Descrição do PR sempre preenchida** com contexto, o que mudou e como testar — não deixe o template em branco.
- **Um PR por issue.** Se durante o trabalho surgir a necessidade de algo fora do escopo, abra uma nova issue em vez de expandir o PR atual.
- **Não force-push em branches compartilhadas** (ex.: uma branch que outra pessoa também está usando) sem avisar antes.
- **Revise seu próprio diff antes de pedir review** (`git diff main...HEAD`) — reduz idas e vindas na revisão.
- **CI verde é pré-condição para pedir review**, não uma verificação que roda em paralelo à revisão humana.

## 7. Gaps conhecidos (para revisitar)

- A branch protection da `main` tem `required_status_checks.contexts` vazio — ou seja, hoje o GitHub **não bloqueia** o merge se a pipeline de CI falhar (mesmo a pipeline rodando e reportando status). Para que a regra da seção 4 seja *imposta* pelo GitHub (e não apenas seguida por convenção), é preciso adicionar os contexts `Install, Test & Build (frontend)` e `Install, Test & Build (backend)` como *required status checks* na branch protection de `main`.
- `Automatically delete head branches` está desativado nas configurações do repositório. Ativar essa opção automatiza a limpeza descrita na seção 5, sem depender de lembrar manualmente.

Essas duas mudanças são configurações do repositório no GitHub (não arquivos versionados) e devem ser aplicadas deliberadamente por quem administra o repositório.
