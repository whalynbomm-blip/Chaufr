# Database schema

The initial PostgreSQL schema is in `migrations/0001_initial_schema.sql`.

It defines shared identities and roles, driver profiles, vehicles, versioned fare rules, trips, trip lifecycle events and administrative audit events.

## Important implementation rules
- Apply schema changes through versioned migrations; do not edit a migration after it has been applied in a shared environment.
- Store only password hashes produced by a modern password-hashing algorithm in `password_hash`.
- Encrypt identity and vehicle registration data before writing encrypted byte values.
- Enforce user role and record ownership in the API on every request.
- Do not expose raw identity data, password hashes or private audit details to client apps.
- A trip must retain the fare rule and quote inputs used when its fixed price was calculated.
- Use transactions for trip state changes and append a trip event for each accepted transition.

This schema is a foundation, not yet a deployed database. Production migration, backup, encryption-key management, retention and access policies still need to be configured.

## Driver availability and dispatch

The follow-on migration `migrations/0002_driver_dispatch.sql` adds:
- `driver_presence`: online/offline state, optional coordinates, accuracy and last-seen time.
- `trip_offers`: per-driver offers with pending/accepted/declined/expired/withdrawn states and expiry timestamps.

Apply migrations in numeric order. The API does not yet read or write these tables; they are not live driver availability or dispatch functionality. Authenticated repository methods and transaction-safe trip acceptance must be implemented before enabling real trips.
