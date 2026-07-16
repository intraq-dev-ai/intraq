# Contributing

Thanks for helping improve intraQ.

## Ground rules

- Do not commit credentials, `.env` files, client data, generated artifacts, or
  private operational material.
- Do not add paid AI Studio logic, proprietary domain packs, feedback learning
  loops, eval pipelines, multi-tenant governance, billing, or managed-service
  code to this repository.
- Contributions are submitted under the IntraQ Sustainable Use License unless a
  separate written agreement says otherwise.

## Local setup

```bash
nvm use
npm ci
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

See [QUICKSTART.md](QUICKSTART.md) for full setup.

## Before opening a pull request

```bash
npm test
npm run build
```

Also check that no secrets or generated files are included:

```bash
git status --short
```

Generated folders such as `node_modules/`, `dist/`, coverage reports, and local
`.env` files should stay untracked.

## Good first contribution areas

- documentation fixes;
- connector documentation;
- sample metadata improvements;
- dashboard builder usability fixes;
- Analyzer grounding and refusal-quality improvements;
- test coverage for public-source workflows.
