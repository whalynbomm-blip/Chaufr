# Chaufr deployment preparation

## Current position

The API is container-ready (`services/api/Dockerfile`) and exposes `GET /health` for a hosting platform health check. It has not yet been deployed to a public host. No live API URL exists, and no production secrets or credentials are stored in GitHub. The owner console is served by the API at `/owner` and uses same-origin authenticated API requests.

## Hosting requirements

Choose a provider that supports:
- Docker deployments from the GitHub repository;
- Node.js 22 / the included Dockerfile;
- HTTPS public service URL;
- environment variables and secret storage;
- health checks against `/health`;
- a managed PostgreSQL database when database integration is implemented.

## Deployment settings

- Repository: `whalynbomm-blip/Chaufr`
- Dockerfile: `services/api/Dockerfile`
- Docker build context: `services/api`
- Health check path: `/health`
- Port: `3000` (the service reads `PORT`)
- Start command: provided by the Dockerfile

## Required environment variables

Set secrets and fare configuration only in the hosting provider's private environment settings. Never commit credentials or production values.

| Variable | Purpose |
|---|---|
| `PORT` | Port supplied by the host (usually injected automatically) |
| `DATABASE_URL` | Managed PostgreSQL connection string |
| `DB_SSL` | Set `true` when the database provider requires TLS |
| `VEHICLE_DATA_ENCRYPTION_KEY` | Private base64-encoded 32-byte key for encrypted driver vehicle/licence data |
| `FARE_QUOTE_SIGNING_SECRET` | Private random signing key for server-issued route quotes |
| `GOOGLE_MAPS_SERVER_API_KEY` | Server-restricted key with Google Routes API enabled |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full Firebase service-account JSON used by the API to send FCM notifications |
| `DOCUMENT_ENCRYPTION_KEY` | Separate base64 32-byte key for encrypted identity and vehicle documents |
| `FARE_RULE_VERSION` | Identifier for the active fare rules |
| `FARE_CURRENCY` | Currency code; use `ZAR` for South Africa |
| `FARE_BASE`, `FARE_PER_KM`, `FARE_PER_MINUTE` | Fare calculation inputs |
| `FARE_OPERATING_PER_KM` | Operating-cost allowance per kilometre |
| `FARE_COMMISSION_RATE` | Standard platform commission as a decimal fraction (default 0.12) |
| `DAILY_ACTIVATION_FEE` | Driver daily activation fee in ZAR (default 30) |
| `FARE_MINIMUM` | Minimum passenger fare |
| `FARE_FUEL_PRICE_PER_LITRE` | Configured fuel price per litre |
| `FARE_FUEL_STANDARD_L100KM`, `FARE_FUEL_COMFORT_L100KM`, `FARE_FUEL_XL_L100KM` | Fuel consumption assumptions by vehicle category |

Generate private keys with `openssl rand -base64 32`. The Android Firebase configuration values are separate CI secrets: `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_PROJECT_ID`, and `FIREBASE_SENDER_ID`. Android builds also need `chaufrApiBaseUrl` and passenger map key `chaufrGoogleMapsApiKey` as protected Gradle properties. The `chaufrPaymentsEnabled` Gradle property defaults to `false`; leave it false throughout core development and enable it only in the final payment-gateway stage. Restrict the Android Maps key to the passenger app package and signing certificate, and restrict the server key to Routes API.

Do not use sample values as live commercial pricing without approval and validation.

## Deferred payment gateway setup — final stage

Do not configure these values during the core build. They are intentionally reserved for the final payment integration stage after both apps, the backend, the owner console and safety workflows have passed acceptance testing:

- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_WEBHOOK_SECRET`
- `PAYSTACK_CALLBACK_URL`
- `PAYOUT_DATA_ENCRYPTION_KEY`

For local pre-payment end-to-end testing only, the daily activation requirement can be bypassed by setting both `NODE_ENV=development` and `CHAUFR_TEST_BYPASS_ACTIVATION=true`. The API rejects this bypass outside development. Never set it in production. The production rule remains R30 daily activation before a driver can go online or view offers.

## Before public launch

1. Select and authorize the hosting provider and deployment project.
2. Configure production fare rules and verify the health endpoint.
3. Connect PostgreSQL and apply versioned migrations through `0024`.
4. Provision the owner account securely through a trusted database operator; public registration must never grant owner privileges.
5. Review the owner pricing console at `/owner`, approve all fare bands and verify audit events before allowing public trip requests.
6. Connect a routing provider and calculate routes on trusted server-side infrastructure.
7. Configure monitoring, backups, privacy controls and incident response.
8. Complete security and South African legal/compliance review.

Dispatch, driver foreground location updates, passenger trip tracking and FCM notification plumbing are implemented in the codebase, but require production configuration and real-device verification. Passenger and driver Android screens include core trip, support, trusted-contact and document-verification workflows. The Paystack adapter code is present from earlier development, but payment gateway configuration, checkout activation, refunds and bank payouts are intentionally deferred until the core apps, backend, owner console and safety workflows are complete. Do not configure Paystack secrets during this build phase. The development-only driver activation bypass is permitted only with `NODE_ENV=development` and `CHAUFR_TEST_BYPASS_ACTIVATION=true`; never enable it in production. Trip ratings and support tickets are implemented in the core product. Account recovery, email/phone ownership verification, stronger distributed rate limiting, and production safety/contact verification remain outstanding. Payment transfer reconciliation is deferred with the payment gateway. The Android CI workflow currently produces debug APKs only; a signed release build requires a protected signing key and final release configuration.

See [payments, payouts, refunds and identity verification](payments-identity.md) for the Paystack setup, endpoints, secrets and launch gates.
