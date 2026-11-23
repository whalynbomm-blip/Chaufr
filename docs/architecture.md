# Chaufr architecture

## System shape

Chaufr is a monorepo with three client applications and one shared API:

1. Passenger Android application
2. Driver Android application
3. Owner web dashboard
4. Shared backend API and database

All clients communicate with the backend over HTTPS. Business rules, fare calculation, permissions and trip state transitions are enforced on the server; clients must not be trusted to calculate authoritative fares or authorize privileged actions.

## Proposed implementation stack

- Android: Kotlin, Jetpack Compose, Gradle; separate passenger and driver application IDs.
- Owner dashboard: responsive same-origin web console served by the API, with owner-only authenticated controls.
- API: TypeScript on Node.js with a documented REST interface.
- Database: PostgreSQL with schema migrations.
- Authentication: short-lived access tokens and refresh-token rotation; role and resource checks on every protected API.
- CI: GitHub Actions for linting, tests and reproducible builds.

These are the initial implementation choices and can be adjusted before production deployment. No production hosting, payment provider, maps provider or SMS provider is assumed to be configured yet.

## Main backend domains

- Identity and sessions
- Passenger profiles
- Driver profiles, vehicles and document verification
- Service areas and operating hours
- Fare rules and fare quotes
- Trip requests, matching and trip lifecycle
- Driver availability and location updates
- Earnings, commissions and payout ledger
- Notifications
- Owner administration and audit events

## Fixed fare calculation

The server produces a quote from a versioned fare configuration. Inputs include route distance, estimated duration, vehicle category, configured fuel price, vehicle fuel consumption, operating-cost allowance, driver earnings and platform commission.

The calculation must:
- use explicit units (km, minutes, litres/100 km, currency);
- expose a quote breakdown to the passenger and driver;
- store the fare-rule version and quote inputs with each trip;
- apply minimum fares and rounding rules consistently;
- reject stale or incomplete route/vehicle inputs;
- never let a client submit its own authoritative fare.

The exact coefficients, minimums, commission and driver earnings targets remain configuration decisions and must be confirmed before production fares are enabled.

## Security and privacy

- Enforce authorization in the API, not only in the UI.
- Use least-privilege roles and owner-only administrative capabilities.
- Keep secrets in deployment environment settings / GitHub Actions secrets, never in source.
- Validate and rate-limit authentication, quote and trip endpoints.
- Store audit events for fare changes, account moderation and sensitive admin actions.
- Minimize retention of precise location and identity-document data.
- Use TLS in deployment and encrypt sensitive data at rest.

## Delivery sequence

1. Confirm requirements and establish the monorepo.
2. Implement API foundation, schema and automated tests.
3. Implement fare engine with deterministic unit tests.
4. Build passenger and driver Android flows against the same API.
5. Build the protected owner dashboard.
6. Add maps, notifications, payments and deployment integrations after provider choices and credentials are supplied.
7. Run end-to-end tests and produce signed release APKs using securely stored signing credentials.

## Important production boundary

A repository scaffold or CI build is not a production ride-hailing service. Real dispatch, live location, identity verification, payment settlement, regulatory compliance, hosting and support operations require implementation, provider configuration and real-world testing before launch.
