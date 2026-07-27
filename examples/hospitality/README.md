# Hospitality analytics examples

Hospitality reporting is most useful when it becomes a business health check, not just a chart.

## Example questions

- Is revenue healthy this week compared with last week?
- Which outlet is underperforming, and is the issue covers, average order value, discounting, refunds, or product mix?
- Which products are frequently bought together?
- Which ready-made food items are slow moving and likely to create waste?
- Which bakery items, rolls, or grab-and-go products should be promoted earlier in the day?
- Which category needs marketing focus this month?
- How are occupancy, ADR, and RevPAR trending by property?
- Which channel or rate plan is driving the most room revenue?

## Useful fields

- sale date or business date
- outlet, venue, property, or location
- product, category, modifier, and channel
- gross sales, net sales, discounts, refunds, voids, tax, cost, and margin
- covers, transactions, average order value, and daypart
- stock, production, or waste fields where available
- PMS fields such as rooms sold, rooms available, occupancy, ADR, RevPAR, booking channel, and rate plan

## Dashboard components

- revenue health KPI
- daily revenue trend
- outlet comparison table
- product mix chart
- wastage review table
- combo opportunity table
- PMS occupancy and ADR trend

## Calculation patterns

### Revenue health

Question:

```text
Is revenue healthy this week compared with last week?
```

Expected calculation:

```text
current_period_net_sales
previous_period_net_sales
absolute_change = current_period_net_sales - previous_period_net_sales
percentage_change = absolute_change / previous_period_net_sales
```

Answer should include the selected business date range, location filter, net/gross basis, and whether refunds and voids are excluded.

### Product mix and margin

Question:

```text
Which categories are driving revenue but hurting margin?
```

Expected calculation:

```text
net_sales by category
cost by category
gross_margin = net_sales - cost
gross_margin_percentage = gross_margin / net_sales
```

Dashboard output should be a ranked table with category, sales, margin, margin percentage, and contribution percentage.

### Wastage risk for ready-made food

Question:

```text
Which ready-made items are slow moving and likely to create waste?
```

Expected calculation:

```text
units_produced
units_sold
unsold_units = units_produced - units_sold
sell_through_percentage = units_sold / units_produced
estimated_waste_value = unsold_units * unit_cost
```

If production or waste fields are missing, IntraQ should say which fields are required instead of guessing.

### Basket and combo opportunity

Question:

```text
Which products are frequently bought together?
```

Expected calculation:

```text
orders containing product_a and product_b
pair_frequency
pair_revenue
attach_rate = orders_with_pair / orders_with_product_a
```

Dashboard output should show product pair, pair frequency, attach rate, pair revenue, and suggested promotion angle.

## Trust checks

- Confirm the date basis: transaction date, business date, stay date, or invoice date.
- Confirm whether sales are gross, net, tax-inclusive, or tax-exclusive.
- Confirm how refunds, voids, discounts, complimentary items, and service charges are handled.
- Confirm whether location filters use outlet, venue, property, company, or tenant.
