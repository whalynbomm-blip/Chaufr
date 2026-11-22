# Fare engine notes

This first implementation is a deterministic calculation module with automated tests. It is not yet connected to a live API or production database.

The formula separates the driver subtotal from platform commission:
- Driver subtotal = base fare + distance charge + time charge + fuel cost + operating cost.
- Platform commission = driver subtotal × configured commission rate.
- Passenger total = the greater of the configured minimum fare and driver subtotal plus commission.

Fuel cost is derived from distance × vehicle fuel consumption ÷ 100 × configured fuel price. The engine returns a breakdown and fare-rule version.

All rates are configuration inputs, not recommendations or live market prices. Production configuration must be approved and stored server-side. South African rand (ZAR) is the default currency, but no live fare values are enabled by this repository.
