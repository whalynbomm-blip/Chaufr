# Chaufr

Chaufr is an independent ride-hailing platform built as a monorepo with three connected products and one shared backend.

## Products
- **Passenger Android app** — account and trip requests, upfront fixed fares, live trip status, trip history and receipts.
- **Driver Android app** — driver onboarding, vehicle and document review, availability, trip handling, navigation handoff, and earnings.
- **Owner web dashboard** — protected operations, driver/passenger management, trip monitoring, fare configuration, service areas and reporting.

## Product principles
- Fixed fares are calculated by Chaufr; passengers and drivers do not negotiate fares in-app.
- Fare calculations must be transparent, configurable and auditable.
- Driver earnings and platform commission are shown separately.
- The passenger app, driver app and dashboard use the same authenticated backend and data model.
- Chaufr uses its own brand, design and implementation; it does not copy another platform's proprietary code or exact interface.

## Repository layout
```
apps/
  passenger-android/
  driver-android/
  owner-dashboard/
services/
  api/
docs/
  architecture.md
  product-requirements.md
.github/
  workflows/
```

## Development status
The repository is the source of truth. Work is being staged in small, reviewable commits. The initial architecture and product requirements are documented; runnable application modules and automated builds will follow.

## Core fare inputs
Trip distance, estimated travel time, vehicle category and fuel consumption, current configured fuel price, operating costs, platform commission and driver earnings target. Fare rules must be configurable by an authorized owner and versioned so each quote can be explained later.

## Security baseline
Use role-based access control for passengers, drivers, operations staff and owners. Never commit credentials, signing keys, API secrets or production personal data. Sensitive driver documents and owner actions require server-side authorization and audit logs.

## Build
Build instructions will be added alongside each runnable app/service. GitHub Actions is the CI system for this repository.
