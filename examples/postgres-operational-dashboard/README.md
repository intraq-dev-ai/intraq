# Postgres operational dashboard example

This example shows how to position IntraQ for a team with operational data already stored in PostgreSQL.

The goal is not only to connect Postgres. The goal is to turn SQL-backed tables into trusted AI answers and reusable dashboard components.

## Example source tables

```text
orders
  id
  business_date
  location_id
  channel
  gross_sales
  discount_amount
  refund_amount
  tax_amount
  net_sales
  cost_amount

order_items
  id
  order_id
  product_id
  quantity
  gross_sales
  discount_amount
  net_sales
  cost_amount

products
  id
  name
  category
  sku

locations
  id
  name
  region
```

## Metadata IntraQ needs

- Date field: `orders.business_date`
- Revenue metric: `sum(orders.net_sales)`
- Gross sales metric: `sum(orders.gross_sales)`
- Discount metric: `sum(orders.discount_amount)`
- Refund metric: `sum(orders.refund_amount)`
- Margin metric: `sum(orders.net_sales - orders.cost_amount)`
- Relationships:
  - `orders.id = order_items.order_id`
  - `order_items.product_id = products.id`
  - `orders.location_id = locations.id`

## Questions to try

```text
How is revenue trending by day for this month?
```

Expected output:

- line chart
- grouped by `business_date`
- metric: net sales
- evidence: SQL query and row count

```text
Which products have high revenue but low margin?
```

Expected output:

- table sorted by net sales descending
- columns: product, category, net sales, cost, gross margin, gross margin percentage
- warning if cost fields are missing

```text
Which locations are underperforming compared with last week?
```

Expected output:

- table by location
- current period net sales
- previous period net sales
- absolute change
- percentage change
- selected date range and comparison range

```text
Create a dashboard with revenue trend, revenue by channel, margin by category, and top products.
```

Expected output:

- four dashboard components
- each component has a saved data source/table binding
- each chart remains backed by SQL, not static data

## Trust checks

- Always confirm the selected date range.
- Confirm whether revenue uses gross, net, tax-inclusive, or tax-exclusive sales.
- Confirm how discounts, refunds, voids, and cancelled orders are handled.
- Confirm whether results are filtered by location, tenant, company, or all accessible data.
- If a relationship or metric definition is missing, ask for it before generating a final answer.

