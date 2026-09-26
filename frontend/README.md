# Frontend — Spend Control

Interface React + TypeScript + Vite. O Dockerfile compila a aplicação com Node e entrega apenas os arquivos de `dist` em uma imagem Nginx Alpine. O Nginx executa como usuário `nginx`, na porta 8080, com suporte às rotas da SPA e healthcheck HTTP.

## Desenvolvimento local

Na pasta `frontend`, execute `npm ci` e `npm run dev`. Use `.env.example` como referência para seu `.env` local. Para compilar, execute `npm run build`; para os testes, `npm test -- --runInBand`.

## Build e execução com Docker

Execute os comandos abaixo na raiz do repositório, com Docker instalado e em execução:

```bash
docker build -t spend-control-frontend:local ./frontend
docker run -d --name spend-control-frontend -p 127.0.0.1:8080:8080 spend-control-frontend:local
```

Abra http://localhost:8080. Este container serve apenas o frontend; para usar dados e autenticação, inicie também a API conforme o README da raiz. Por padrão, o navegador acessa a API em http://localhost:3333.

## Verificação local

```bash
docker exec spend-control-frontend nginx -t
docker exec spend-control-frontend id
docker inspect --format '{{.State.Health.Status}}' spend-control-frontend
curl --fail http://localhost:8080/
curl --fail http://localhost:8080/rota-de-teste
docker logs spend-control-frontend
```

O teste de configuração deve passar, `id` deve mostrar usuário diferente de root e o healthcheck deve chegar a `healthy` (aguarde cerca de 30 segundos). As duas URLs devem retornar o HTML da aplicação: a segunda verifica o fallback das rotas SPA. Isso verifica o servidor estático; não confirma a integração com a API.

Para parar e remover o container de teste:

```bash
docker stop spend-control-frontend
docker rm spend-control-frontend
```

## Variáveis do build

As variáveis `VITE_*` são incorporadas ao JavaScript durante a compilação e ficam acessíveis ao navegador. Nunca coloque senhas ou tokens nelas. Alterá-las com `docker run -e` não modifica o frontend já compilado; gere outra imagem usando `--build-arg`:

```bash
docker build -t spend-control-frontend:local --build-arg VITE_API_URL=http://localhost:3333 ./frontend
```

| Argumento | Finalidade | Padrão |
| --- | --- | --- |
| `VITE_API_URL` | Endereço da API acessível pelo navegador | `http://localhost:3333` |
| `VITE_PLUGGY_CONNECTOR_IDS` | IDs dos conectores separados por vírgula | vazio |
| `VITE_INTERNAL_PARTY_PATTERN` | Regex para identificar transferências internas | vazio |

## Problemas comuns

- **Permissão negada em `/var/run/docker.sock`:** em Linux, execute os comandos Docker com `sudo` no seu terminal, se sua conta tiver essa permissão.
- **Porta 8080 ocupada:** use `-p 127.0.0.1:8081:8080` e acesse http://localhost:8081.
- **Interface abre, mas a API falha:** confirme que a API está rodando e que `VITE_API_URL` aponta para um endereço acessível pelo navegador. Confira também a configuração de CORS da API.

## Uso de IA

Foi solicitada revisão do Dockerfile com base no guia da disciplina. Foram aplicados usuário não-root, correção do contexto da diretiva `pid`, remoção de permissões globais de escrita e documentação do teste local. A execução do container ainda precisa ser validada em um ambiente com acesso ao Docker.
