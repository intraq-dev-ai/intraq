# Energy retail reporting examples

Energy retail reporting depends on precise account, billing, payment, and risk definitions. The examples below are for operational analytics over SQL-backed billing data.

## Example questions

- What is total credit exposure by customer segment?
- Which accounts moved into arrears this billing cycle?
- What is revenue by tariff for the selected period?
- Which accounts have overdue balances over 30, 60, or 90 days?
- How did payment performance change compared with the previous billing run?
- Which invoices have large adjustment or estimation variance?
- Which customer segments have the highest collection risk?

## Useful fields

- account, customer, site, meter, and segment identifiers
- invoice date, due date, payment date, and billing cycle
- tariff, plan, rate, consumption, billed units, adjustments, credits, and balance
- arrears age, credit exposure, payment status, and exception flags

## Dashboard components

- credit exposure KPI
- arrears aging table
- revenue by tariff chart
- payment performance trend
- billing exception table
- customer risk segment view

## Trust checks

- Confirm whether reporting is account-level, site-level, meter-level, or customer-level.
- Confirm how credits, reversals, estimates, and adjustments are treated.
- Confirm the billing cycle and date range before comparing periods.
- Confirm whether balances are pre-settlement or post-settlement.
