# intraQ examples

These examples show the types of operational questions intraQ is designed to answer from SQL-backed data models.

They are public-safe product examples, not proprietary domain packs. Use them to understand how to shape metadata, semantic models, Analyzer prompts, and dashboard workflows.

## Example sets

- [Hospitality](hospitality/README.md)
- [Postgres operational dashboard](postgres-operational-dashboard/README.md)
- [Energy retail](energy-retail/README.md)
- [Ecommerce](ecommerce/README.md)
- [SaaS embedded analytics](saas/README.md)

## Pattern

Each example follows the same flow:

```text
Business question
  → required data fields
  → trusted calculation
  → answer format
  → dashboard component
```

The important part is not the wording of the question. The important part is making the metric definition, filters, date range, and source tables explicit enough that the AI can generate SQL safely.
