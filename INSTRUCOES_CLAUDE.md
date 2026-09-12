Construir um agregador financeiro via Open Finance (Pluggy) para duas pessoas.
- **Backend:** Node.js (Express), TypeScript, Prisma ORM. Arquitetura de Monolito Modular.
- **Frontend:** React (Vite), TypeScript, Tailwind + Shadcn/UI.
- **Banco de Dados:** PostgreSQL.

# Diretrizes de Operação (Core Rules)
1. Foco exclusivo em código de produção e lógica de negócio. Em nenhuma etapa do desenvolvimento devem ser criados, sugeridos ou executados testes automatizados.
2. Utilize ativamente suas skills e plugins de terminal de forma autônoma para instalar dependências, manipular arquivos, interagir com o Prisma CLI e levantar o contêiner do Docker.
3. Não crie componentes genéricos desnecessários; seja pragmático.

# Skills (Scripts) Necessários para o Claude Code
O Claude Code consegue rodar comandos no seu terminal. Para que ele trabalhe bem, você deve pedir a ele para criar estes scripts no seu package.json logo no início:

1. npm run db:push: Para sincronizar rapidamente as mudanças que o Claude fizer no banco de dados local sem precisar criar arquivos de migração complexos no início.
2. npm run webhook:mock: Como seu PC local não recebe webhooks da internet (sem o uso do Ngrok), você precisará de um script Node simples que faça um POST no seu próprio backend simulando um webhook da Pluggy (ex: simulando que novas transações chegaram). O Claude Code poderá rodar isso para testar o backend.
3. npm run seed: Um script para popular o banco de dados com dados falsos do casal (Mock), para que o Claude possa montar os gráficos no React antes de conectar na API real da Pluggy.


Você é um Engenheiro de Software Sênior especializado em TypeScript, React, Node.js e integrações financeiras. Vamos construir um Dashboard Pessoal de Open Finance (para um casal).

# REGRAS GERAIS:
1. Não crie testes automatizados. Foco em velocidade e entrega do MVP funcional.
2. Use TypeScript estrito em tudo.
3. Crie um monorepo simples (pastas /frontend e /backend na raiz).

# PASSO 1: INFRAESTRUTURA E BACKEND
1. Inicialize um projeto Node.js no backend com Express, TypeScript e Prisma.
2. Crie um arquivo docker-compose.yml na raiz para rodar o PostgreSQL.

3. Modele o schema.prisma com a seguinte estrutura relacional exata para suportar finanças de casal:
3.1. User: (id, name)
3.2. Item (Conexão Pluggy): (id, user_id, pluggy_item_id, institution)
3.3. Account: (id, item_id, type, balance)
3.4. Transaction: (id, account_id, amount, date, description, category). Categoria é apenas uma String.

4. Crie um script de seed no Prisma para gerar dois usuários (Marido e Esposa) e preencher algumas contas e transações falsas.
5. Crie rotas no Express para: listar contas por usuário, listar saldo consolidado do casal, e listar transações.

# PASSO 2: FRONTEND
1. Inicialize um projeto React com Vite (npm create vite@latest frontend -- --template react-ts).
2. Instale e configure o Tailwind CSS e o Shadcn/UI.
3. Construa um layout de Dashboard com uma Sidebar.
4. Crie duas visões principais consumindo a API local: "Minhas Finanças" (filtrado pelo User ID) e "Finanças do Casal" (soma total). Use o Shadcn/UI para montar Cards (exibindo saldos) e uma Tabela de transações.

Por favor, comece criando a estrutura de pastas, o docker-compose, o backend com Express e o schema do Prisma. Execute os comandos no terminal para instalar as dependências necessárias e me avise quando o banco estiver pronto para rodarmos o seed.