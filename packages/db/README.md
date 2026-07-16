# intraQ Database

This package owns the Prisma schema, migrations, and neutral local
seed data.

Seeded local login:

| Email | Password | Role |
|---|---|---|
| `admin@local.intraq.test` | `intraq-demo` | `SINGLE_TENANT_OWNER` |

Use `DATABASE_URL` from `.env.example` or the target deployment before running:

```sh
npm run db:validate --workspace @intraq/db
npm run db:generate --workspace @intraq/db
npm run db:migrate --workspace @intraq/db
npm run db:seed --workspace @intraq/db
```
