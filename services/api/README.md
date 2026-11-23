# Chaufr API — development guide

## Run locally

Requires Node.js 20 or newer and PostgreSQL 14 or newer for database-backed operation.

```sh
cd services/api
npm install
npm test
npm start
```

The API listens on port 3000 by default. Set database and secret values in the host environment before starting the server. `.env.example` documents development settings; Node does not automatically load that file. Open `/owner` on the API origin to use the private owner console.

## PostgreSQL setup

Create a database and a dedicated application user, then set `DATABASE_URL` in the API environment. When that variable is present, startup connects to PostgreSQL and applies pending SQL migrations in filename order before opening the HTTP port. Migrations are tracked in `schema_migrations` and protected by a PostgreSQL advisory lock.

Set `DB_SSL=true` for managed PostgreSQL services that require TLS. Certificate verification remains enabled. Do not disable certificate checks or commit database credentials. Without `DATABASE_URL`, the API runs in its existing demo/development mode without persistence.

The migration runner applies the checked-in schema migrations. Authentication, driver onboarding, activation gating and trip request/acceptance routes use PostgreSQL records.

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

## Fare schedule and trip acceptance

The central fare engine supports the owner's initial duration bands, traffic adjustments, vehicle multipliers, route-cost floor and 12% commission. See `FARE-ENGINE.md` for the complete schedule and calculations. The passenger-facing fare includes the commission; expected driver earnings are returned separately. Client fare and traffic overrides are ignored.

Authenticated passengers can create a trip request with `POST /v1/trips`. The server calculates and stores the fare snapshot and a five-minute request expiry. Authenticated drivers can query `GET /v1/driver/trips/available` and accept through `POST /v1/driver/trips/:tripId/accept`. Acceptance is transactional, records the assigned driver/vehicle and locks the stored fare. Later fare-rule changes do not recalculate an accepted trip.

## Daily driver activation

A driver must have a successful R30 ZAR activation payment recorded for the current South African operating date before going online or accessing trip requests. The activation is unique per driver and date, and a paid activation is marked non-refundable. Driver-facing responses expose only that driver's activation status and trip earnings, not company revenue totals.

`GET /v1/driver/activation` returns the driver's activation status. The internal `recordVerifiedActivationPayment` service method is designed to be called only after a payment provider verifies the transaction. There is intentionally no client-controlled payment confirmation endpoint. A real payment provider/webhook still needs to be connected before drivers can make payments in production. Push notifications and dispatch fan-out are not yet implemented; any future delivery path must apply the same paid-activation check.

## Current limitations

- Route distance and duration are supplied to the API; no maps/geocoding/routing provider or live traffic source is connected. Until that integration exists, trip requests use the normal-traffic baseline.
- Fare schedule defaults are development values and require owner approval/configuration before launch.
- Passenger trip requests, driver acceptance, trip start and trip completion are implemented. Live matching/dispatch, driver-arriving state, cancellation, live tracking and passenger trip history remain outstanding.
- The R30 activation data model and server-side gate are implemented, but payment provider integration and driver payment UI are not.
- Driver approval/rejection tools, document uploads, passenger support workflows and full financial reconciliation are not yet implemented. The owner console currently provides overview metrics and central pricing controls.
- Driver location currently uses device last-known location when going online; continuous background location updates are not implemented.
- Android app API URL is blank in current debug builds; configure it after deploying the API.
- Production hosting and payment processing are not implemented.
- Values in `.env.example` are development placeholders, not approved commercial fares.

See `../../docs/deployment.md` before deploying.
