# Publication Checklist

Use this checklist before making the repository public.

## Source hygiene

- [ ] No `.env` files, credentials, provider keys, or database passwords.
- [ ] No client names, private exports, acceptance artifacts, screenshots, or
      generated reports.
- [ ] No private operational, go-to-market, migration, or managed-service material.
- [ ] No paid AI Studio logic, proprietary packs, eval pipelines, feedback
      learning loops, billing, or control-plane code.

## Project metadata

- [ ] `README.md` explains the product, license boundary, quickstart, and demo
      login.
- [ ] `docs/CONFIGURATION.md` explains the required and optional environment
      variables.
- [ ] `LICENSE.md` and `COMMERCIAL.md` reflect the intended source-available
      terms.
- [ ] `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`, and
      `ROADMAP.md` are present.
- [ ] GitHub issue templates, pull request template, and CI workflow are present.

## Validation

- [ ] `npm ci`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `docker compose config`
- [ ] Optional: `docker compose up --build`

## GitHub settings

- [ ] Disable blank issues or direct them to the issue templates.
- [ ] Require CI before merging. After the first pull request runs, select the
      `Validate source` status check in the branch protection rule.
- [ ] Protect the default branch.
- [ ] Add repository topics such as `analytics`, `dashboard`, `ai`, `postgres`,
      `self-hosted`, and `source-available`.

## Legal review

- [ ] Have counsel review the custom source-available license before relying on
      it commercially.
