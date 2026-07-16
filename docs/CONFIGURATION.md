# Configuration

intraQ reads configuration from environment variables. For local development,
copy `.env.example` to `.env` at the repository root.

```bash
cp .env.example .env
```

Never commit `.env` files, API keys, passwords, OAuth tokens, customer data, or
private deployment notes.

## Minimum required configuration

For local development without Docker, set:

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. |
| `AUTH_TOKEN_SECRET` | Yes | Secret used for auth tokens. Must be at least 32 characters. |

Example:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/intraq
AUTH_TOKEN_SECRET=replace-with-at-least-32-random-characters
```

## Docker Compose

The Docker Compose quickstart supplies its own internal database URL:

```text
postgresql://intraq:intraq@db:5432/intraq?schema=public
```

Useful Compose variables:

| Variable | Default | Purpose |
|---|---|---|
| `INTRAQ_PORT` | `4100` | Host port published by Docker Compose. Use this if port `4100` is busy. |
| `AUTH_TOKEN_SECRET` | local placeholder | Override for production-like Compose runs. Use a strong 32+ character value. |

Example:

```bash
INTRAQ_PORT=4110 AUTH_TOKEN_SECRET="$(openssl rand -hex 32)" docker compose up --build
```

Only the app port is published to the host. PostgreSQL stays inside the Compose
network to avoid conflicting with local databases.

## API and web runtime

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Runtime mode. Production mode enforces API auth by default. |
| `API_HOST` | `127.0.0.1` | API bind host. Docker sets this to `0.0.0.0`. |
| `API_PORT` / `PORT` | `4100` | API port. |
| `WEB_ORIGIN` | `http://127.0.0.1:5173` | Web origin used by backend routes and generated links. |
| `VITE_API_BASE_URL` | `/api` | Browser API base path for the Vite app. |
| `INTRAQ_WEB_HOST` | `0.0.0.0` | Vite dev server host. |
| `INTRAQ_WEB_PORT` | `5173` | Vite dev server port. |
| `DASHBOARD_PERSISTENCE` | `prisma` | Set to `memory` only for transient development runs. |
| `SERVE_WEB_FROM_API` | `true` | Serve built web assets from the API process. |
| `WEB_DIST_DIR` | `apps/web/dist` | Override built web asset directory. |
| `API_ENFORCE_AUTH` | production default | Force API auth on/off. Leave unset for normal use. |
| `API_ACCEPT_AUTH_COOKIE` | `false` | Accept auth from the HTTP-only cookie as well as bearer tokens. |
| `SEED_DEMO_RUNTIME` | `true` | Enables demo/runtime seed behavior where used. |
| `ENABLE_RUNTIME_DIAGNOSTICS` | `false` | Enables protected runtime diagnostics endpoints. |

## Secrets and encryption

`AUTH_TOKEN_SECRET` is required. It is also used as the fallback encryption
secret for stored configuration values when more specific keys are not set.

Optional stronger separation:

| Variable | Purpose |
|---|---|
| `INTRAQ_SECRET_KEY` | General app secret for encrypting stored secrets. |
| `DATA_SOURCE_CONFIG_ENCRYPTION_KEY` | Secret for encrypted data-source connection config. |
| `SMTP_ENCRYPTION_KEY` | Secret for encrypted SMTP password values. |
| `JWT_SECRET` | Backward-compatible alias for `AUTH_TOKEN_SECRET`. |
| `ENCRYPTION_KEY` / `SESSION_SECRET` | Backward-compatible encryption secret aliases. |

Use strong, unique values in production-like deployments.

## AI provider configuration

AI behavior is bring-your-own-provider. Without a configured provider, core app
setup still works, but Analyzer, Dashboard Builder, and SQL assistant AI paths
may use fallback/refusal behavior instead of model-generated answers.

For local/manual contributor testing in this repository workspace, use Codex
OAuth only. Do not put OpenAI API keys in local contributor `.env` files.

Common provider variables:

| Variable | Purpose |
|---|---|
| `AI_AGENT_PROVIDER` | Explicit provider: `codex`, `openai`, or `gemini`. Aliases `INTRAQ_AI_PROVIDER` and `AGENT_PROVIDER` are also read. |
| `CODEX_AGENT_ENABLED` / `CODEX_AGENT_DISABLED` | Enable or disable Codex OAuth provider. |
| `CODEX_HOME` | Directory containing `auth.json`; defaults to `~/.codex`. |
| `CODEX_AUTH_PATH` | Explicit path to Codex `auth.json`. |
| `CODEX_MODEL` | Codex model override. |
| `CODEX_AGENT_TIMEOUT_MS` | Codex request timeout. |
| `OPENAI_AGENT_ENABLED` / `OPENAI_AGENT_DISABLED` | Enable or disable OpenAI API-key provider. |
| `OPENAI_API_KEY` | OpenAI API key for self-hosted deployments. |
| `OPENAI_MODEL` | OpenAI model override. |
| `OPENAI_API_ENDPOINT` | OpenAI-compatible endpoint override. |
| `OPENAI_AGENT_TIMEOUT_MS` | OpenAI request timeout. |
| `GEMINI_AGENT_ENABLED` / `GEMINI_AGENT_DISABLED` | Enable or disable Gemini provider. |
| `GEMINI_API_KEY` / `GOOGLE_GEMINI_API_KEY` | Gemini API key. |
| `GEMINI_MODEL` | Gemini model override. |
| `GEMINI_API_ENDPOINT` | Gemini endpoint override. |
| `GEMINI_AGENT_TIMEOUT_MS` | Gemini request timeout. |

Analyzer-specific overrides:

| Variable | Purpose |
|---|---|
| `ANALYZER_ANSWER_MODEL` / `ANALYZER_EXPLANATION_MODEL` | Answer/explanation model override. |
| `ANALYZER_PLAN_MODEL` / `ANALYZER_PLANNING_MODEL` | Planning model override. |
| `ANALYZER_PLAN_PREFERRED_PROVIDER` / `ANALYZER_PLANNING_PROVIDER` | Planning provider override. |
| `ANALYZER_ANSWER_TIMEOUT_MS` | Analyzer answer timeout. |

Dashboard Builder:

| Variable | Purpose |
|---|---|
| `DASHBOARD_BUILDER_AGENT_TIMEOUT_MS` | Dashboard-builder agent timeout. |

## SMTP and email delivery

SMTP is optional. If it is not configured, email delivery features will report
that SMTP is unavailable.

| Variable | Purpose |
|---|---|
| `SMTP_HOST` | SMTP server host. |
| `SMTP_PORT` | SMTP server port; defaults to `587`. |
| `SMTP_USER` | SMTP username. |
| `SMTP_PASSWORD` / `SMTP_PASS` | SMTP password. |
| `SMTP_FROM_EMAIL` | Sender email. Defaults to `SMTP_USER` when omitted. |
| `SMTP_FROM_NAME` | Sender display name. |
| `SMTP_REPLY_TO` | Optional reply-to email. |
| `SMTP_BCC` | Optional comma-separated BCC list. |
| `SMTP_SECURE` | Use implicit TLS. Port `465` also enables secure mode. |
| `SMTP_DRY_RUN` / `SMTP_ALLOW_DRY_RUN` | Skip actual send. Development defaults to dry-run behavior when incomplete. |

## SQL and live query safeguards

| Variable | Default | Purpose |
|---|---|---|
| `INTRAQ_SQL_QUERY_TIMEOUT_MS` | source/default driven | Live SQL query timeout fallback. |
| `LIVE_SQL_QUERY_TIMEOUT_MS` | source/default driven | Backward-compatible live SQL query timeout fallback. |
| `INTRAQ_SQL_ROUTE_TIMEOUT_MS` | `16000` | API route-level SQL operation timeout. |
| `INTRAQ_LIVE_SQL_POOL_MAX` | app default | Max connection pool size for live SQL sources. |
| `INTRAQ_LIVE_SQL_CACHE_TTL_MS` | `30000` | Live SQL result cache TTL. Set `0` to disable. |
| `INTRAQ_LIVE_SQL_CACHE_MAX_ENTRIES` | `50` | Max live SQL result cache entries. |
| `INTRAQ_RUNTIME_SAMPLE_ROWS_MAX` | app default | Max sample rows loaded into runtime context. |

## Public API and embed controls

These are optional and only needed when using public API workflow access or
external embedded dashboards.

| Variable | Purpose |
|---|---|
| `PUBLIC_API_CLIENT_ID` | Client id for client-credentials token requests. |
| `PUBLIC_API_CLIENT_SECRET` | Client secret for client-credentials token requests. |
| `PUBLIC_API_CLIENT_TENANT_ID` / `INTRAQ_TENANT_ID` / `TENANT_ID` | Tenant context for public API clients. |
| `PUBLIC_API_CLIENT_USER_ID` | Optional user context for public API clients. |
| `EMBED_EXTERNAL_ALLOWED_DASHBOARDS` | Comma-separated dashboard ids allowed for external embed clients. `*` allows all. |

## Release metadata

These are optional and mostly useful for packaged/self-hosted releases:

| Variable | Purpose |
|---|---|
| `APP_VERSION` / `RELEASE_VERSION` | Version shown by release-info endpoints. |
| `APP_BUILD_ID` / `RELEASE_BUILD_ID` | Build id. |
| `SOURCE_VERSION` / `HEROKU_SLUG_COMMIT` | Source commit. |
| `RELEASE_CHANNEL` / `INTRAQ_UPDATER_CHANNEL` | Release channel. |
| `DEPLOYMENT_TYPE` | Deployment type; defaults to `self-hosted`. |
| `RELEASE_PACKAGE_TYPE` | Package type; defaults to `source`. |
| `APP_RELEASE_NOTES` / `RELEASE_NOTES` | Release notes. |
| `APP_RELEASED_AT` / `RELEASE_CREATED_AT` | Release timestamp. |

## Validation

After changing configuration, validate the source package:

```bash
npm test
npm run db:validate
npm run build
docker compose config
```
