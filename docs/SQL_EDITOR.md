# SQL Editor

SQL Editor gives developers and analysts a direct way to inspect connected data,
run SQL, and validate the models used by Analyzer and Dashboard Builder.

## What it supports

- Selecting configured data sources.
- Running read-oriented SQL through the app query layer.
- Inspecting result tables.
- Iterating on SQL models before using them in dashboards or AI workflows.
- Keeping query work close to the same metadata used by Analyzer and Dashboard
  Builder.

## Safe usage

Use SQL Editor against databases you control or are authorized to query. Keep
connection strings and database passwords in `.env` or deployment secrets, never
in screenshots, examples, issues, or committed files.

## Demo path

1. Run the seeded app.
2. Open **SQL Editor**.
3. Select the sample sales data source.
4. Run a simple query against the sample sales model.
5. Use the result to validate the seeded dashboard metrics.

## Relationship to AI

Analyzer and Dashboard Builder depend on trustworthy metadata and reusable SQL
models. SQL Editor is the manual inspection path for checking those definitions
before relying on AI-assisted answers or dashboards.
