# intraQ

[Website](https://intraq.dev)

intraQ is a source-available AI reporting and dashboard platform for
self-hosted operational analytics.

It includes local dashboards, Analyzer, SQL models, MCP, data-source management,
and dashboard-builder workflows.

AI is grounded in local metadata, data dictionary entries, SQL models,
relationships, dashboard context, and safe result summaries. This source tree
intentionally excludes the paid AI Studio, proprietary domain intelligence,
control plane, paid release tooling, private operational docs, generated
artifacts, credentials, and private operational material.

![intraQ dashboard builder with AI sidebar](docs/assets/demo/00-readme-hero-ai-sidebar.png)

## License

intraQ is source-available under the IntraQ Sustainable Use License.

You may use, fork, modify, and run intraQ for internal business, personal,
educational, evaluation, and non-commercial purposes.

Paid hosting, managed service use, white-label resale, OEM redistribution, paid
third-party support/operations, or use in a competing commercial analytics, BI,
dashboard, SQL-assistant, or AI-reporting service requires a commercial
agreement with IntraQ.

See [LICENSE.md](LICENSE.md) and [COMMERCIAL.md](COMMERCIAL.md).

## Public Source Scope

This repository is the generalized public source package. It excludes
non-public material, private operational docs, paid AI Studio, proprietary
domain packs, feedback learning loops, eval pipelines, multi-tenant governance,
billing, and managed-service code.

See [docs/PUBLIC_SOURCE_SCOPE.md](docs/PUBLIC_SOURCE_SCOPE.md), [CONTRIBUTING.md](CONTRIBUTING.md),
and [SUPPORT.md](SUPPORT.md).

## Requirements

- Node.js 24 LTS. This repo pins `24.16.0` in `.nvmrc` and `.node-version`.
- npm 11.12+.
- PostgreSQL 14+.

## Quickstart

The shortest path is Docker Compose:

```bash
cp .env.example .env
docker compose up --build
```

Then open `http://localhost:4100`.

For local development without Docker:

```bash
nvm use
npm ci
cp .env.example .env
```

Edit `.env` and set:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/intraq
AUTH_TOKEN_SECRET=replace-with-at-least-32-random-characters
```

Then run:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Seeded local login:

| Email | Password |
|---|---|
| `admin@local.intraq.test` | `intraq-demo` |

## Development

```bash
npm test
npm run build
```

Copy `.env.example` to `.env` for local development. Do not commit local env
files, database passwords, provider keys, client data, or private operational
material.

More setup detail is in [QUICKSTART.md](QUICKSTART.md). Environment variables
are documented in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

AI provider setup for Codex OAuth, OpenAI, and Gemini is documented in
[docs/AI_PROVIDER_SETUP.md](docs/AI_PROVIDER_SETUP.md).
For Codex OAuth browser login, set `OPENAI_OAUTH_CLIENT_ID` in the API
environment; otherwise the admin page cannot start the Codex login flow.

The seeded product demo and suggested walkthrough videos are documented in
[docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md).

Focused workflow docs:

- [MCP tools](docs/MCP.md)
- [AI Analyzer](docs/AI_ANALYZER.md)
- [Dashboard Builder](docs/DASHBOARD_BUILDER.md)
- [SQL Editor](docs/SQL_EDITOR.md)
