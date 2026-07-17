# Quickstart

This guide runs intraQ locally with the generic sample sales dataset.

## Option 1: Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:4100`.

The Compose setup starts PostgreSQL, runs migrations, seeds the local demo data,
and serves the built web app from the API container.

Only the app is published to the host on port `4100`. PostgreSQL is kept inside
the Compose network so it does not conflict with a local database on port
`5432`.

If port `4100` is already in use, choose another host port:

```bash
INTRAQ_PORT=4110 docker compose up --build
```

Seeded local login:

| Email | Password |
|---|---|
| `admin@local.intraq.test` | `intraq-demo` |

## Option 2: Local development

Prerequisites:

- Node.js 24 LTS. This repo pins `24.16.0` in `.nvmrc` and `.node-version`.
- npm 11.12+.
- PostgreSQL 14+.

Use the pinned Node version:

```bash
nvm use
```

Install dependencies:

```bash
npm ci
```

Create local environment config:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/intraq
AUTH_TOKEN_SECRET=replace-with-at-least-32-random-characters
```

Full environment-variable reference: [docs/CONFIGURATION.md](docs/CONFIGURATION.md).
Demo walkthrough: [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md).

Prepare the database:

```bash
npm run db:migrate
npm run db:seed
```

Start development servers:

```bash
npm run dev
```

The API runs on `http://127.0.0.1:4100`.
The web dev server runs on `http://127.0.0.1:5173`.

## Validation

```bash
npm test
npm run build
```

`npm test` runs type-checking and a small source-package smoke test.

## AI provider setup

AI is bring-your-own-provider. Self-hosted operators can configure Codex OAuth,
OpenAI, or Gemini from the admin UI or environment variables. Contributors
should avoid putting provider keys in shared env files, screenshots, issues, or
pull requests.

After signing in, open **Admin → AI & MCP → AI API Key Management** to configure
Codex OAuth, OpenAI, or Gemini for Analyzer, Dashboard Builder, and SQL assistant
workflows.

For Codex OAuth browser login, set `OPENAI_OAUTH_CLIENT_ID` in the API
environment first. Keep `OPENAI_OAUTH_REDIRECT_URI` aligned with the Codex
callback URL, usually `http://localhost:1455/auth/callback`. Without a client
ID, **Connect Codex** returns `OPENAI_OAUTH_CLIENT_ID is required to start Codex
OAuth login.`

Detailed setup with screenshots: [docs/AI_PROVIDER_SETUP.md](docs/AI_PROVIDER_SETUP.md).

## What is seeded

The baseline seed creates:

- one local tenant;
- one owner account;
- one generic sample sales source;
- one dashboard-ready `sample_sales_model` table with sample rows and
  metadata;
- one published **Sample Sales Overview** starter dashboard.
