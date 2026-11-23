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

## Authentication endpoints

When PostgreSQL is configured, the API exposes:

- `POST /v1/auth/register` — creates a passenger or driver account and returns a bearer token.
- `POST /v1/auth/login` — accepts an email address or E.164 phone number and password.
- `GET /v1/auth/me` — returns the authenticated account; requires `Authorization: Bearer <token>`.
- `POST /v1/auth/logout` — revokes the supplied bearer session.

Passwords must be 12–128 characters. Registration requires a display name and either an email address or international-format phone number. Public registration is restricted to passenger and driver roles; owner and operations accounts cannot be self-created. Driver accounts receive a pending driver profile. Access tokens are random opaque values; only their SHA-256 hashes are stored. Sessions expire after 30 days and can be revoked. Registration and login have a basic per-process IP rate limit.

These endpoints are an initial account foundation, not a complete production identity system. Email/phone ownership verification, password reset, stronger distributed rate limiting, admin account provisioning and app-side account screens are still outstanding. Do not treat the Android demo screens as connected to live accounts yet.

## Driver onboarding and availability

Authenticated driver accounts can submit a vehicle and licence number through `POST /v1/driver/vehicles`. Vehicle registration and licence identifiers are encrypted with AES-256-GCM before they are stored. This endpoint requires `VEHICLE_DATA_ENCRYPTION_KEY`, a private base64-encoded 32-byte key; generate one with `openssl rand -base64 32` and provide it through the deployment secret manager. Never commit the production key.

Drivers can view their non-sensitive profile through `GET /v1/driver/profile` and update availability through `PUT /v1/driver/presence`. Going online is blocked until the driver profile is verified and at least one vehicle is approved. Owner review/approval tools and document uploads are not yet implemented. The driver Android app now includes the vehicle and licence submission form and connects its online/offline control to the API when a server URL is configured.

## Current limitations

- Route distance and duration are supplied to the API; no maps/routing provider is connected.
- Quotes are estimates and do not create bookings or reserve drivers.
- PostgreSQL connection, ordered migrations, registration/login endpoints and revocable session validation are implemented and integration-tested.
- Driver vehicle submission, verification gates and API-backed online/offline status are implemented. Location is currently captured from the device last-known location when the driver goes online; continuous background location updates are not implemented.
- Android account screens, secure token storage and driver vehicle onboarding are present, but the API URL is blank in the current debug builds. Owner approval, passenger trip creation, driver dispatch and live trip tracking remain outstanding.
- Production hosting and payment processing are not implemented.
- Values in `.env.example` are development placeholders, not approved commercial fares.

See `../../docs/deployment.md` before deploying.
