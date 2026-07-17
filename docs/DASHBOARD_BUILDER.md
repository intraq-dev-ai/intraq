# Dashboard Builder

Dashboard Builder creates and edits dashboards using model-backed data sources,
manual controls, and AI-assisted prompts.

## What it supports

- KPI cards, charts, tables, filters, and dashboard layouts.
- Prompt-assisted dashboard creation when an AI provider is configured.
- Editing generated components before saving or publishing.
- Reusing seeded sample data and connected SQL models.
- Export-oriented dashboard rendering for reporting workflows.

## Demo path

1. Run the app and log in.
2. Open **Dashboard Builder**.
3. Select the seeded **Sample Sales** data source/model if prompted.
4. Ask: `Create a sales dashboard with revenue by channel and gross margin by category.`
5. Review the draft components.
6. Edit labels, filters, or layout.
7. Save or publish the dashboard.

## How AI is grounded

Dashboard Builder uses local product context rather than unsupported guessing:

- data-source metadata;
- table and column definitions;
- SQL model information;
- dashboard state;
- safe result summaries.

If no AI provider is configured, users can still build dashboards manually and
use the seeded starter dashboard. Configure a provider in
[AI provider setup](AI_PROVIDER_SETUP.md) to enable prompt-assisted creation.

## Boundary

Community Dashboard Builder includes generic model-aware AI assistance. Paid AI
Studio, trained domain packs, managed multi-tenant governance, and white-label
commercial use are outside this public-source package.
