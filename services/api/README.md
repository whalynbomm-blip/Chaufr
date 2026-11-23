# Chaufr API — development guide

## Run locally

Requires Node.js 20 or newer and PostgreSQL 14 or newer for database-backed operation.

```sh
cd services/api
npm install
npm test
npm start
```

The API listens on port 3000 by default. Set fare values as environment variables before starting the server. `.env.example` documents the development settings; Node does not automatically load that file.

## PostgreSQL setup

Create a database and a dedicated application user, then set `DATABASE_URL` in the API environment. When that variable is present, startup connects to PostgreSQL and applies pending SQL migrations in filename order before opening the HTTP port. Migrations are tracked in `schema_migrations` and protected by a PostgreSQL advisory lock.

Set `DB_SSL=true` for managed PostgreSQL services that require TLS. Certificate verification remains enabled. Do not disable certificate checks or commit database credentials. Without `DATABASE_URL`, the API runs in its existing demo/development mode without persistence.

The migration runner currently applies the checked-in schema migrations; it does not yet make the HTTP routes use database records.

## Endpoints

### Health check
```sh
curl http://localhost:3000/health
```

### Fare estimate
```sh
curl -X POST http://localhost:3000/v1/fare-quotes \
  -H 'content-type: application/json' \
  -d '{"distanceKm":8.5,"durationMinutes":22,"vehicleCategory":"standard"}'
```

Supported categories: `standard`, `comfort`, `xl`.

The request accepts route distance, estimated duration and vehicle category. Fare rates, fuel price, vehicle fuel consumption, operating cost, commission and minimum fare are read from server configuration. Client-supplied fare settings are ignored.

## Authentication security foundation

The API includes tested scrypt password-hashing and verification helpers, opaque access-token generation, token hashing, and migration `0003_auth_sessions.sql` for expiring/revocable sessions. These are security building blocks only. Driver/passenger registration, login endpoints, database-backed session validation, phone/email verification and password reset are not yet implemented or available in the apps. Do not treat the current demo apps as authenticated accounts.

## Current limitations

- Route distance and duration are supplied to the API; no maps/routing provider is connected.
- Quotes are estimates and do not create bookings or reserve drivers.
- PostgreSQL connection and ordered migration execution are implemented, but user/session HTTP operations and trip persistence are not yet wired up.
- Authentication helpers and session schema exist, but HTTP authentication is not yet implemented.
- Production hosting and payment processing are not implemented.
- Values in `.env.example` are development placeholders, not approved commercial fares.

See `../../docs/deployment.md` before deploying.
