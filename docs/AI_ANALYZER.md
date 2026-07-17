# AI Analyzer

AI Analyzer lets users ask plain-English questions against connected data and
seeded data models. Answers are grounded in local metadata, data dictionary
entries, SQL models, safe sample rows, and query results.

## What it does

- Reads available data sources and dashboard-ready models.
- Plans a query using known table and field metadata.
- Runs safe SQL through the application query layer.
- Returns an answer with supporting context so users can verify the result.

Without a configured AI provider, the core app still runs, but Analyzer cannot
produce full model-generated answers. Configure Codex OAuth, OpenAI, or Gemini
from **Admin -> AI & MCP -> AI API Key Management**.

## Demo path

1. Run the app with the seeded sample data.
2. Log in as `admin@local.intraq.test`.
3. Open **AI Analyzer**.
4. Ask one of:
   - `Which channel has the highest revenue?`
   - `How is revenue trending by day?`
   - `Compare revenue and gross margin by category.`
5. Check the generated answer and supporting query context.

## Data requirements

Analyzer works best when data sources have:

- clear table names;
- column descriptions or imported metadata;
- reusable SQL models for business metrics;
- sample rows that represent the data shape;
- dashboard-ready models for common questions.

The Community edition includes generic model-aware analysis. Proprietary trained
domain intelligence and AI Studio workflows are commercial features and are not
included in this repository.
