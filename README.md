# intraQ — Self-hosted AI BI with a Knowledge Layer

[![CI](https://github.com/intraq-dev-ai/intraq/actions/workflows/ci.yml/badge.svg)](https://github.com/intraq-dev-ai/intraq/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-IntraQ%20Sustainable%20Use-blue)](LICENSE.md)
[![Docker](https://img.shields.io/badge/docker-compose-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![Node](https://img.shields.io/badge/node-24.x-339933?logo=node.js&logoColor=white)](.nvmrc)

[Website](https://intraq.dev) · [Docs](docs/DEMO_GUIDE.md) · [Quickstart](QUICKSTART.md) · [Configuration](docs/CONFIGURATION.md) · [Comparisons](docs/comparisons/README.md) · [Discussions](https://github.com/intraq-dev-ai/intraq/discussions) · [Contributing](CONTRIBUTING.md)

**intraQ is a source-available AI business intelligence platform that lets teams query SQL-backed operational data using natural language, generate trusted SQL, and build interactive dashboards without traditional BI complexity.**

It combines AI analytics, natural language SQL, text-to-SQL workflows, an AI dashboard builder, embedded analytics foundations, MCP tools, RAG-style context retrieval, and a semantic layer built from local metadata, data dictionary entries, SQL models, relationships, dashboard context, and safe result summaries.

![intraQ dashboard builder with AI sidebar](docs/assets/demo/00-readme-hero-ai-sidebar.png)

## Why intraQ?

Most AI reporting tools stop at “generate a chart” or “write a query.” intraQ is built around verified operational BI:

- **Answers stay tied to evidence** — SQL, selected data source, result rows, and assumptions remain inspectable.
- **Dashboards come from real queries** — AI-created components are saved as live dashboard elements, not static screenshots.
- **Business context is explicit** — dictionaries, SQL models, relationships, metrics, and dashboard context guide the AI before it answers.
- **Unsafe gaps are visible** — when data, filters, or model context are missing, intraQ says what is missing instead of inventing an answer.
- **Operational use cases come first** — revenue health, product mix, wastage signals, account risk, billing exceptions, and embedded customer reporting.

The goal is not just natural language SQL. The goal is AI BI that a team can inspect, reuse, and improve.

## Why teams use intraQ

- **AI business intelligence** — ask operational questions in plain English.
- **Trusted SQL generation** — inspect SQL and evidence before publishing results.
- **AI dashboard builder** — turn answers into reusable dashboards.
- **Self-hosted BI** — run with Docker Compose against your own database.
- **Semantic layer** — define tables, fields, joins, metrics, and business meaning.
- **LLM-ready context** — ground answers in local metadata and RAG-style knowledge retrieval.
- **Embedded analytics foundation** — use intraQ as a reporting layer for product and internal workflows.
- **Provider-flexible AI** — configure Codex OAuth, OpenAI, or Gemini from the admin UI.

## Who is this for?

intraQ is built for teams that want answers from operational data without a dedicated BI function:

- **Hospitality operators** — restaurants, cafes, bars, hotels, and multi-venue groups analysing POS and PMS data (net sales, covers, food cost, labour, menu mix, occupancy, ADR).
- **Energy retailers** — billing, arrears, credit exposure, and payment analytics.
- **POS / PMS / platform vendors** — embed white-label AI analytics for your own customers instead of building it in-house.
- **SaaS & product teams** — customer-facing embedded reporting over product data.
- **Internal BI & operations** — self-service analytics grounded in governed definitions.

If your operational data lives in a SQL database and you want plain-English answers with the SQL visible, intraQ is for you.

## Demo flow

```text
Ask a business question
        ↓
AI plans against metadata and SQL models
        ↓
Trusted SQL is generated and executed
        ↓
The answer returns with evidence
        ↓
Save the result as a live dashboard component
```

Use the seeded demo to try questions such as:

- `How is revenue trending by day?`
- `Which channel has the highest revenue?`
- `Compare revenue and gross margin by category.`
- `Which location has the highest average order value?`
- `Create a dashboard chart for revenue by channel.`

See the full [Demo guide](docs/DEMO_GUIDE.md).

## Architecture

```text
User question
  → AI Analyzer
  → Metadata + semantic model + saved SQL models
  → SQL planning and validation
  → Connected operational database
  → Result summary + evidence
  → Dashboard Builder
  → Saved live dashboard
```

The public source includes local dashboards, Analyzer, SQL models, MCP, data-source management, and dashboard-builder workflows.

It intentionally excludes paid AI Studio, proprietary domain intelligence, control plane, paid release tooling, private operational docs, generated artifacts, credentials, and private operational material.

## Use cases and knowledge bases

intraQ is built for operational reporting where users need more than static charts:

- **Hospitality analytics** — revenue health, covers, product mix, wastage signals, outlet performance, PMS and POS reporting.
- **Energy retail reporting** — accounts, billing cycles, arrears, credit exposure, payments, exceptions, and customer risk.
- **SaaS embedded analytics** — customer-facing dashboards over product data.
- **Ecommerce analytics** — revenue, orders, products, channels, margins, and customer behavior.

Explore practical question sets in [`examples/`](examples/README.md).

## Comparisons

intraQ is not trying to replace every enterprise reporting suite. It is focused on operational BI workflows where teams want AI-assisted SQL, local control, and dashboards from governed data models.

| Capability | intraQ | Power BI | Metabase | Lightdash |
|---|:---:|:---:|:---:|:---:|
| Plain-English → SQL | ✅ | Partial | Partial | Partial |
| AI-built dashboards | ✅ | Partial | ❌ | ❌ |
| Semantic / knowledge layer | ✅ | Partial | Limited | ✅ (dbt) |
| Evidence & SQL shown for every answer | ✅ | ❌ | Partial | Partial |
| Self-hosted | ✅ | ❌ | ✅ | ✅ |
| Embeddable / white-label | ✅ | Limited | Limited | Limited |
| No data team required | ✅ | ❌ | Partial | ❌ |

Detailed comparison pages:

- [intraQ vs Metabase](docs/comparisons/intraq-vs-metabase.md)
- [intraQ vs Wren AI](docs/comparisons/intraq-vs-wren-ai.md)
- [intraQ vs Power BI](docs/comparisons/intraq-vs-power-bi.md)
- [intraQ vs Lightdash](docs/comparisons/intraq-vs-lightdash.md)

### intraQ vs Power BI

Power BI is a broad reporting suite. intraQ focuses on natural language SQL, evidence-backed AI answers, and turning operational questions into live dashboard components from SQL-backed models.

### intraQ vs Metabase

Metabase is strong for self-service querying and dashboards. intraQ adds an AI Analyzer and dashboard-builder workflow designed around plain-English questions, trusted SQL generation, and evidence review.

### intraQ vs Looker

Looker centers on governed semantic modeling at enterprise scale. intraQ is lighter to run locally and focuses on operational teams that want AI-assisted reporting over existing SQL data.

### intraQ vs Sigma Computing

Sigma provides spreadsheet-style cloud analytics. intraQ focuses on self-hosted or controlled deployments, natural language SQL, and operational dashboards grounded in local metadata and models.

## Quickstart

The shortest path is Docker Compose:

```bash
cp .env.example .env
docker compose up --build
```

Then open `http://localhost:4100`.

Seeded local login:

| Email | Password |
|---|---|
| `admin@local.intraq.test` | `intraq-demo` |

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

More setup detail is in [QUICKSTART.md](QUICKSTART.md). Environment variables are documented in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

AI provider setup for Codex OAuth, OpenAI, and Gemini is documented in [docs/AI_PROVIDER_SETUP.md](docs/AI_PROVIDER_SETUP.md). For Codex OAuth browser login, set `OPENAI_OAUTH_CLIENT_ID` in the API environment; otherwise the admin page cannot start the Codex login flow.

## Development

```bash
npm test
npm run build
```

Copy `.env.example` to `.env` for local development. Do not commit local env files, database passwords, provider keys, client data, or private operational material.

Focused workflow docs:

- [AI Analyzer](docs/AI_ANALYZER.md)
- [Dashboard Builder](docs/DASHBOARD_BUILDER.md)
- [SQL Editor](docs/SQL_EDITOR.md)
- [MCP tools](docs/MCP.md)
- [AI provider setup](docs/AI_PROVIDER_SETUP.md)
- [Comparisons](docs/comparisons/README.md)
- [Publication checklist](docs/PUBLICATION_CHECKLIST.md)

## License and public source scope

intraQ is source-available under the IntraQ Sustainable Use License.

You may use, fork, modify, and run intraQ for internal business, personal, educational, evaluation, and non-commercial purposes.

Paid hosting, managed service use, white-label resale, OEM redistribution, paid third-party support/operations, or use in a competing commercial analytics, BI, dashboard, SQL-assistant, or AI-reporting service requires a commercial agreement with IntraQ.

See [LICENSE.md](LICENSE.md), [COMMERCIAL.md](COMMERCIAL.md), [docs/PUBLIC_SOURCE_SCOPE.md](docs/PUBLIC_SOURCE_SCOPE.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [SUPPORT.md](SUPPORT.md).

## Suggested GitHub topics

Recommended repository topics:

`ai-analytics`, `ai-bi`, `llm`, `rag`, `semantic-model`, `semantic-layer`, `business-intelligence`, `analytics-platform`, `ai-dashboard`, `ai-dashboard-builder`, `text-to-sql`, `dashboard-builder`, `self-hosted`, `postgres`, `sql`, `embedded-analytics`, `reporting`, `natural-language-sql`, `natural-language-query`, `operational-analytics`

Use `agentic-ai` only if you want the repository positioned around autonomous multi-step AI planning. If the public source is presented mainly as governed AI reporting and dashboard generation, the topics above are more precise.
