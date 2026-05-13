# Cybercom Dashboard Fullstack

Aplicação fullstack convertida para Node.js + MySQL.

## Estrutura

- `server.js` - servidor Express e APIs REST
- `public/` - frontend estático
- `db/schema.sql` - esquema e dados iniciais do MySQL

## Como usar

1. Instale dependências:
   ```bash
   npm install
   ```
2. Crie o banco de dados MySQL e execute `db/schema.sql`:
   - Banco: `cybercom_dashboard`
   - Usuário padrão: `root`
   - Senha padrão: `''` (vazia)

3. Ajuste variáveis de ambiente se necessário:
   - `DB_HOST`
   - `DB_USER`
   - `DB_PASS`
   - `DB_NAME`
   - `SESSION_SECRET`

4. Inicie o servidor:
   ```bash
   npm start
   ```

5. Acesse em `http://localhost:3000`.

## Colocando no GitHub

1. Crie uma conta em https://github.com se ainda não tiver.
2. Crie um novo repositório com nome `cybercom-dashboard`.
3. No terminal dentro da pasta do projeto, rode:
   ```bash
   git init
   git add .
   git commit -m "Primeiro commit"
   git remote add origin https://github.com/SEU_USUARIO/cybercom-dashboard.git
   git push -u origin main
   ```
4. Substitua `SEU_USUARIO` pelo seu usuário do GitHub.

## Implantando no Railway

1. Crie uma conta em https://railway.app e faça login.
2. Crie um novo projeto e conecte ao GitHub.
3. Selecione o repositório `cybercom-dashboard`.
4. Crie um serviço do tipo `Web Service`.
5. Configure o comando de build:
   ```bash
   npm install
   ```
6. Configure o comando de start:
   ```bash
   npm start
   ```

## Configurando o MySQL no Railway

1. No Railway, adicione um plugin `MySQL` ao projeto.
2. Copie as variáveis de ambiente que o Railway criar:
   - `DB_HOST`
   - `DB_USER`
   - `DB_PASS`
   - `DB_NAME`
3. No Railway, vá em `Environment` e adicione essas variáveis.
4. Adicione também:
   - `SESSION_SECRET` = `uma-senha-secreta` (mude para algo forte)

## Importando o banco de dados

1. No Railway, acesse a conexão MySQL criada.
2. Use a ferramenta de console do Railway ou um cliente MySQL para executar o arquivo `db/schema.sql`.
3. Isso criará as tabelas necessárias e o usuário `admin`.

## Exemplo do `.env.example`

Use o arquivo `.env.example` como referência quando precisar definir variáveis de ambiente localmente.

## Login

- Admin: `admin`
- Senha: `123`

> Observação: em produção, sempre use hashing de senhas e `SESSION_SECRET` seguro.
