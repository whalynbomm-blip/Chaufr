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
3. Connect PostgreSQL and apply versioned migrations through `0026`.
4. Provision the owner account securely through a trusted database operator; public registration must never grant owner privileges.
5. Review the owner pricing console at `/owner`, approve all fare bands and verify audit events before allowing public trip requests.
6. Connect a routing provider and calculate routes on trusted server-side infrastructure.
7. Configure monitoring, backups, privacy controls and incident response.
8. Complete security and South African legal/compliance review.

Dispatch, driver foreground location updates, passenger trip tracking and FCM notification plumbing are implemented in the codebase, but require production configuration and real-device verification. Passenger and driver Android screens include core trip, support, trusted-contact and document-verification workflows. The Paystack adapter code is present from earlier development, but payment gateway configuration, checkout activation, refunds and bank payouts are intentionally deferred until the core apps, backend, owner console and safety workflows are complete. Do not configure Paystack secrets during this build phase. The development-only driver activation bypass is permitted only with `NODE_ENV=development` and `CHAUFR_TEST_BYPASS_ACTIVATION=true`; never enable it in production. Trip ratings and support tickets are implemented in the core product. Account recovery, email/phone ownership verification, stronger distributed rate limiting, and production safety/contact verification remain outstanding. Payment transfer reconciliation is deferred with the payment gateway. The Android CI workflow currently produces debug APKs only; a signed release build requires a protected signing key and final release configuration.

See [payments, payouts, refunds and identity verification](payments-identity.md) for the Paystack setup, endpoints, secrets and launch gates.


## Production secrets and fail-closed startup

The API now validates production configuration before opening its listening port. When `NODE_ENV=production`, startup fails if any of these are absent or malformed:

- `DATABASE_URL` — PostgreSQL connection URL.
- `VEHICLE_DATA_ENCRYPTION_KEY` and `DOCUMENT_ENCRYPTION_KEY` — independent base64-encoded 32-byte keys.
- `FARE_QUOTE_SIGNING_SECRET` and `GOOGLE_MAPS_SERVER_API_KEY`.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — valid service-account JSON with project ID, client email and private key.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` — sender number in E.164 format.
- `SMS_VERIFICATION_SECRET` — at least 32 bytes.

Generate encryption keys independently with `openssl rand -base64 32`. Put values in the hosting provider's secret manager, not GitHub source files, Docker build arguments, Android resources or chat. Rotate any credential that has ever been committed or exposed. Use separate Firebase projects and credentials for staging and production where possible. Restrict Google server keys to the Routes API and appropriate server/network restrictions.

The production validator is not a substitute for confirming provider-side permissions. After configuring secrets, deploy to a staging environment first, then verify:
1. `GET /health` reports database connected, Firebase configured and emergency SMS configured.
2. Firebase can deliver a test push to a registered test device in both app roles.
3. A verified, consenting test contact without a Chaufr account receives a Twilio SMS; record the Twilio message SID and final delivery status.
4. Owner-console support reply round-trip works using separate test passenger, driver and owner accounts.
5. Test identity documents can be downloaded, reviewed, approved/rejected and audited. Never upload real identity documents to staging.
6. One-off and recurring scheduled rides materialise and dispatch at their intended local pickup times; test worker restart and duplicate prevention.
7. Database backups can be restored, TLS is enforced, owner access is least-privilege, logs redact secrets and personal data, and rate limits/abuse monitoring are active.

## Driver identity verification — manual, no paid vendor

Chaufr will launch with its own owner-controlled manual driver verification process. No paid third-party identity-verification provider, subscription or per-driver check is part of the launch plan. Drivers upload the required documents through the driver app; the API encrypts them before storage; the owner reviews each document and records approval or rejection with a reason. Drivers remain blocked from going online until the required checklist is approved and their vehicle is approved. For the initial application, only a valid South African driver's licence is mandatory and must be manually approved; vehicle approval and any legally required operating permits remain separate launch/compliance gates.

Manual review is not an automated authenticity check and does not guarantee that a document is genuine. Owners must inspect the original documents and follow applicable South African e-hailing rules. Keep access restricted, audit document views and decisions, and complete POPIA/legal review before collecting real identity documents.

## Deployment status

No production host, database, domain, secret manager or live provider credentials are connected by this repository workflow. Deployment and real provider delivery therefore remain blocked until the owner provisions those external resources. Do not enable public rides or collect real identity documents before staging acceptance, POPIA/legal review and a tested backup/restore procedure.
