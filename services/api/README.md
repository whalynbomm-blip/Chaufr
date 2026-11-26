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

### Google Maps route preview

The passenger app uses Google Places Autocomplete on Android to select pickup and destination points. The API then calls Google Routes server-side through `POST /v1/routes/preview`. The server returns traffic-aware distance/duration and a short-lived signed route quote. Passenger trip creation verifies that signed quote and recalculates the fare from its server-issued measurements, so a modified client cannot change the route distance or duration at booking time.

Configure two separate Google credentials in the API deployment environment:

- `GOOGLE_MAPS_SERVER_API_KEY`: server-restricted key with Routes API enabled. Restrict it to the Routes API and, where supported, the server's egress IP.
- `FARE_QUOTE_SIGNING_SECRET`: private random secret used to sign five-minute route quotes. Generate with `openssl rand -base64 32`.

Do not put either server value in the Android app or commit them to Git. The Android Places/Maps key is separate and must be restricted to the Android package and signing certificate.

The route preview endpoint is limited to 30 requests per source IP per minute. Production deployments should also use a shared rate limiter and provider quota/budget alerts.

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

These endpoints provide the account foundation used by the passenger and driver Android account cards. Production identity hardening still requires email/phone ownership verification, password reset/recovery, stronger distributed rate limiting and secure owner account provisioning. The mobile apps require the production API URL before account and trip features can operate.

## Driver onboarding and availability

Authenticated driver accounts can submit a vehicle and licence number through `POST /v1/driver/vehicles`. Vehicle registration and licence identifiers are encrypted with AES-256-GCM before they are stored. This endpoint requires `VEHICLE_DATA_ENCRYPTION_KEY`, a private base64-encoded 32-byte key; generate one with `openssl rand -base64 32` and provide it through the deployment secret manager. Never commit the production key.

Drivers can view their non-sensitive profile through `GET /v1/driver/profile` and update availability through `PUT /v1/driver/presence`. Going online is blocked until the driver profile is verified and at least one vehicle is approved. Owner-only driver verification and vehicle approval are available in the private owner console. Document image uploads and automated licence/vehicle verification remain outstanding. The driver Android app includes the vehicle and licence submission form and connects its online/offline control to the API when a server URL is configured.

## Fare schedule and trip acceptance

The central fare engine supports the owner's initial duration bands, traffic adjustments, vehicle multipliers, route-cost floor and 12% commission. See `FARE-ENGINE.md` for the complete schedule and calculations. The passenger-facing fare includes the commission; expected driver earnings are returned separately. Client fare and traffic overrides are ignored.

Authenticated passengers can create a trip request with `POST /v1/trips`. The server calculates and stores the fare snapshot and a five-minute request expiry. Authenticated drivers can query `GET /v1/driver/trips/available` and accept through `POST /v1/driver/trips/:tripId/accept`. Acceptance is transactional, records the assigned driver/vehicle and locks the stored fare. Later fare-rule changes do not recalculate an accepted trip.

## Daily driver activation

A driver must have a successful R30 ZAR activation payment recorded for the current South African operating date before going online or accessing trip requests. The activation is unique per driver and date, and a paid activation is marked non-refundable. Driver-facing responses expose only that driver's activation status and trip earnings, not company revenue totals.

`GET /v1/driver/activation` returns the driver's activation status. The internal `recordVerifiedActivationPayment` service method is designed to be called only after a payment provider verifies the transaction. There is intentionally no client-controlled payment confirmation endpoint. A real payment provider/webhook still needs to be connected before drivers can make payments in production.

## Current limitations

- Production hosting, managed PostgreSQL provisioning, production secrets and public API URL still need to be configured.
- Google Routes traffic-aware ETA and distance estimation is integrated server-side, but production use requires `GOOGLE_MAPS_SERVER_API_KEY` and `FARE_QUOTE_SIGNING_SECRET`.
- Driver dispatch offers eligible drivers sequentially with an offer timeout and redispatch after decline/expiry. Driver location is updated by an Android foreground location service; passenger trip status polls for fresh driver coordinates. Real-device testing is still required.
- FCM device registration and notification delivery are implemented, but require matching Firebase Android configuration values in CI and `FIREBASE_SERVICE_ACCOUNT_JSON` on the API host.
- Daily R30 activation is enforced server-side, but payment-provider checkout/webhooks are not connected; do not treat the internal verified-payment method as a public payment route.
- Safety Shield trip-linked reporting/blocking, SOS event recording, trusted-contact storage, 12-hour live trip-sharing links and GPS-based route-deviation/unusual-stop alerts are implemented. FCM alerts reach the other participant and trusted contacts who have Chaufr accounts. SMS/voice delivery, contact ownership verification, emergency-service integration and field validation remain outstanding; SOS is not an emergency response service.
- Scheduled one-off rides and weekday recurring commute rules are stored and materialized into dispatchable ride requests by the API's minute worker. Recurring bookings are generated on a rolling 30-day horizon, in Africa/Johannesburg time, with a maximum 180-day rule duration. Reward-ticket redemption is intentionally disabled for future bookings until ticket reservation/refund handling is added.
- Saver, Standard and Priority choices are available in passenger booking. They change FairMatch weights only; they do not alter approved fare bands, platform commission or driver earnings.
- Document image uploads, automated identity/vehicle verification, passenger/driver ratings, customer support workflows, refunds and financial reconciliation remain outstanding.
- Android debug builds need the deployed `chaufrApiBaseUrl`; passenger map selection also needs an Android-restricted `chaufrGoogleMapsApiKey`.
- Values in `.env.example` are development placeholders, not approved commercial fares.

See `../../docs/deployment.md` before deploying.


## Scheduled rides and recurring commutes

Authenticated passengers can use:

- `POST /v1/passenger/scheduled-rides` — book a pickup at least 30 minutes and up to 90 days ahead. The route quote is verified at booking and the fare snapshot is retained.
- `POST /v1/passenger/recurring-rides` — create a weekday rule (Monday=1 through Sunday=7), local pickup time and date range up to 180 days.
- `GET /v1/passenger/scheduled-rides` — list one-off bookings and recurring rules.
- `DELETE /v1/passenger/scheduled-rides/:id` and `DELETE /v1/passenger/recurring-rides/:id` — cancel future bookings/rules.

The API host materializes recurring occurrences over a rolling 30-day horizon and checks due bookings every minute. At pickup time it creates a normal trip and invokes the existing FairMatch dispatch flow. A scheduled trip still depends on an eligible, online, activated driver being available. Recurring fares use the verified route/fare snapshot captured when the rule is created. Reward-ticket redemption is not enabled for scheduled or recurring rides until reservation, cancellation and refund semantics are implemented.

Saver, Standard and Priority are matching preferences, not different fare products: Saver gives more weight to driver net and pickup burden, Standard uses normal FairMatch weights, and Priority gives more weight to passenger wait time. All three preserve the current fare schedule and commission rules.

## Safety Shield additions

- `POST /v1/passenger/trusted-contacts` and `POST /v1/driver/trusted-contacts` — save a trusted contact using an E.164 phone number. Matching GET/DELETE endpoints list and remove contacts.
- `POST /v1/safety/trips/:tripId/sos` — records an SOS event, alerts the other trip participant through FCM where available, and sends an FCM alert to trusted contacts who have a Chaufr account.
- `POST /v1/safety/trips/:tripId/share` — creates a random, hashed, 12-hour sharing token. The public `GET /v1/shared-trips/:token` endpoint returns a limited trip status and recent driver location.
- Driver GPS updates during an active trip are checked against the saved route. More than 800 metres from the route can trigger a route-deviation alert. Three or more recent samples showing less than 40 metres of movement across at least three minutes can trigger an unusual-stop alert, with a ten-minute alert cooldown.

SMS/voice messages to contacts, contact ownership verification, an emergency dispatch centre, and real-world accuracy/safety validation are not connected. Users in immediate danger must contact local emergency services. Location alerts are heuristic and may produce false positives or miss events; they must not be relied on as the sole safety measure.

## Owner operations and reward-ride payouts

The private owner console at `/owner` provides platform overview metrics, central fare controls, driver verification and vehicle approval actions. Owner-only payout endpoints list completed free-reward-ride commission requests and support the audited status sequence `requested → approved → paid` or `requested → rejected`. Mark a request as paid only after the platform has independently confirmed the real payment; this review ledger does not transfer money.

- `GET /v1/owner/reward-commission-requests` — list payout requests for owner review.
- `PATCH /v1/owner/reward-commission-requests/:requestId` with `{"status":"approved"}`, `{"status":"rejected"}`, or `{"status":"paid"}` — apply a permitted status transition. Every decision is recorded in `audit_events`.

The 50% reward-ride payout remains a platform liability until a real payment rail and reconciliation process are connected. This owner workflow records review and settlement status only.

## Firebase push notifications

The API can deliver Firebase Cloud Messaging (FCM) HTTP v1 notifications to registered Android passenger and driver devices. Configure `FIREBASE_SERVICE_ACCOUNT_JSON` in the API host's secret manager with the full JSON contents of a Firebase service-account key. The service account must belong to the Firebase project used by both Android apps and have permission to send Firebase Cloud Messaging messages. Never commit this JSON, paste it into the Android app, or expose it in logs.

Both Android apps accept these Gradle properties at build time:

- `firebaseApiKey`
- `firebaseAppId`
- `firebaseProjectId`
- `firebaseSenderId`

Use the matching Android app's Firebase project configuration values. Supply them as protected CI secrets or local Gradle properties; do not commit credentials or private keys. If these values are absent, the apps continue to build, but FCM registration is skipped and push delivery is unavailable.

After a user signs in, the app requests an FCM token and registers it through authenticated `POST /v1/push-devices`. Tokens can be disabled through authenticated `DELETE /v1/push-devices`. The API sends driver-offer alerts and passenger acceptance, trip-start and trip-completion updates. Push delivery failures do not roll back trip state changes. Invalid/unregistered tokens are deactivated.

Android 13 and later require notification permission. The passenger app requests it after sign-in; the driver app requests it as part of going online. Device-level notification settings can still suppress alerts. Test on physical devices with Firebase configured before enabling production dispatch.


## Payment ledger foundation

Migration `0012_payment_ledger.sql` adds provider-neutral ZAR payment intents, provider-event idempotency and an append-only financial ledger. Amounts are stored in integer cents. The service supports two inbound purposes: passenger trip payments and the daily driver activation fee. A verified activation payment is linked to the owning driver and marks that day's activation as paid; a verified passenger payment marks the matching passenger trip as paid.

`src/payment-service.mjs` exposes internal `createIntent` and `recordVerifiedInboundPayment` methods. The latter must only be called after a future provider-specific webhook adapter has verified the provider signature, merchant account and event authenticity. Duplicate provider event IDs are ignored, and amount/currency mismatches are rejected. No public payment-confirmation route is exposed, and no card data is stored.

This is a ledger and settlement foundation, not a live checkout integration. Payment-provider selection, hosted checkout creation, signed webhook verification, failed-payment handling, refunds, payout transfers and reconciliation reports remain to be connected. Do not mark reward-ride commission requests as paid until an actual transfer is confirmed.


## Safety Shield

Authenticated passengers and drivers can report or block the other participant on a trip through the Android trip screen. Reports are linked to the trip and include a controlled reason code plus optional notes (maximum 500 characters). Blocks are stored as directional user pairs and dispatch excludes blocked pairs in either direction. The private owner console exposes the moderation queue and an audited workflow: `open → reviewing → resolved` or `dismissed`.

- `POST /v1/safety/report` — report the other participant on one of the caller's trips.
- `POST /v1/safety/block` — block the other participant on one of the caller's trips.
- `GET /v1/owner/safety-reports` — owner-only moderation queue.
- `PATCH /v1/owner/safety-reports/:reportId` — owner-only status transition.

The current report/block controls are not an emergency response service. SOS calling, trusted contacts, live trip sharing and route-deviation alerts are not yet complete; do not market these as available.
