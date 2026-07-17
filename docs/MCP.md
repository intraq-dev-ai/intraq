# MCP tools

intraQ Community includes MCP-oriented product workflows so compatible AI tools
can work with the same local analytics context used by the web app.

## What MCP can use

The public-source package exposes product context from:

- configured data sources;
- data models and table metadata;
- safe sample rows and result summaries;
- dashboard and component context;
- Analyzer and Dashboard Builder workflow state.

MCP access is intentionally grounded in the local application state. It does not
include paid AI Studio training, proprietary domain packs, hosted control-plane
logic, or private operational material.

## Typical workflows

- Inspect available data sources and models.
- Ask a local analytics question against known metadata.
- Create or refine dashboard components from model-backed results.
- Let an external MCP-capable tool understand what dashboards and models exist
  without copying private operational data into the repository.

## Setup

1. Run intraQ with Docker Compose or local development.
2. Sign in with an owner or admin account.
3. Open **Admin -> AI & MCP -> AI API Key Management**.
4. Configure Codex OAuth, OpenAI, or Gemini if the workflow needs model calls.
5. Use the app's local API/MCP workflow endpoints from a trusted local runtime.

Keep provider keys and database credentials in `.env` or your deployment secret
store. Do not paste secrets into GitHub issues, screenshots, or examples.

## Boundary

Community MCP workflows are useful for local, self-hosted, and developer-driven
analytics automation. Advanced trained domain behavior, managed multi-tenant
governance, and commercial hosted/OEM rights are outside the public-source
scope. See [PUBLIC_SOURCE_SCOPE.md](PUBLIC_SOURCE_SCOPE.md) and
[COMMERCIAL.md](../COMMERCIAL.md).
