# Publication Checklist

Use this checklist before making the repository public. Items marked complete
reflect checks that can be verified from the source repository or GitHub
settings. Legal review remains an external business/legal task.

## Source hygiene

- [x] No `.env` files, credentials, provider keys, or database passwords.
- [x] No client names, private exports, acceptance artifacts, screenshots, or
      generated reports.
- [x] No private operational, go-to-market, migration, or managed-service material.
- [x] No paid AI Studio logic, proprietary packs, eval pipelines, feedback
      learning loops, billing, or control-plane code.

## Project metadata

- [x] `README.md` explains the product, license boundary, quickstart, and demo
      login.
- [x] `docs/CONFIGURATION.md` explains the required and optional environment
      variables.
- [x] `LICENSE.md` and `COMMERCIAL.md` reflect the intended source-available
      terms.
- [x] `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`, and
      `ROADMAP.md` are present.
- [x] GitHub issue templates, pull request template, and CI workflow are present.

## Validation

- [x] `npm ci`
- [x] `npm test`
- [x] `npm run build`
- [x] `docker compose config`
- [x] Optional: `docker compose up --build`

## GitHub settings

- [x] Disable blank issues or direct them to the issue templates.
- [x] Require CI before merging. After the first pull request runs, select the
      `Validate source` status check in the branch protection rule.
- [x] Protect the default branch.
- [x] Add repository topics such as `analytics`, `dashboard`, `ai`, `postgres`,
      `self-hosted`, and `source-available`.

## Legal review

- [ ] Have counsel review the custom source-available license before relying on
      it commercially.
