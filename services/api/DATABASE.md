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

## Authentication sessions

The migration `migrations/0003_auth_sessions.sql` adds revocable, expiring sessions. The API must store only the SHA-256 hash of each opaque bearer token, never the raw token. Revoke sessions on logout, password reset, account suspension or suspected compromise. Expired and revoked sessions must be rejected on every authenticated request.

The built-in crypto helpers in `src/auth-crypto.mjs` use scrypt password hashes, constant-time password comparison and random 256-bit opaque access tokens. They are tested independently, but **registration, login, session persistence, token middleware and database integration are not yet connected to HTTP endpoints**.

Apply migrations in numeric order. The API does not yet read or write these tables; they are not live driver availability, authentication or dispatch functionality. Transaction-safe trip acceptance and role-based access checks are required before enabling real trips.
