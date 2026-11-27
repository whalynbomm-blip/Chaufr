# Chaufr

Chaufr is an independent South African ride-hailing platform developed as a GitHub monorepo.

## Products

- **Passenger Android app** — account access, pickup/destination selection, upfront fares, Saver/Standard/Priority matching preferences, immediate and scheduled bookings, trip status/history, rewards, cancellation controls, trusted-contact management and support.
- **Driver Android app** — onboarding, vehicle and document submissions, online/offline availability, live trip offers and management, scheduled pickup indicators, earnings, trusted-contact management and support.
- **Owner web console** — protected operations, driver and vehicle verification, safety moderation, fare configuration, refund review, payout processing and financial oversight.
- **Shared API** — PostgreSQL-backed authentication, routing/fare calculation, dispatch, driver earnings, scheduled reminders, ratings, support tickets, identity-document review, notifications and Safety Shield. Payment adapters are present but intentionally disabled until the final gateway stage.

## Approved commercial rules

- Daily driver platform activation fee: **R30**, paid before the driver can go online or view offers.
- Standard trip platform commission: **12%**.
- Reward rides: **5% platform commission**; the driver may request the agreed **50% reward-ride earnings payout** through the in-app workflow.
- Reward tickets: one ticket per completed trip; nine tickets unlock an eligible short ride.
- Fare bands and service-tier matching rules are documented in `services/api/FARE-ENGINE.md` and the product requirements. Passenger and driver apps do not negotiate fares.

## Safety and convenience

The codebase includes trusted-contact management, SOS event recording, 12-hour live trip-sharing links, GPS-based route-deviation/unusual-stop alerts, report/block workflows, one-off scheduled rides, recurring weekday bookings, passenger pickup reminders, scheduled pickup indicators for drivers and Saver/Standard/Priority matching preferences. These features require production configuration and field testing; SOS is not an emergency-response service.

## Mobile app redesign

The approved role-based navigation and live-trip-map implementation plan is in [`docs/mobile-navigation-and-live-trip-map.md`](docs/mobile-navigation-and-live-trip-map.md). This is the implementation specification; the navigation UI and live-map integration still need to be built and tested.

## Current verification

The feature branch `feature/payments-payouts-verification` contains the core passenger and driver workflows, Safety Shield, scheduled ride management, trusted contacts, ratings, support tickets, driver earnings and encrypted driver verification-document workflow. Payment adapter code remains in the branch but the Android payment UI is disabled by default with `chaufrPaymentsEnabled=false`; gateway setup and activation are reserved for the final stage.

GitHub Actions builds the API and runs PostgreSQL-backed integration tests on the feature branch. The Android workflow produces passenger and driver debug APKs as a downloadable artifact. The latest selfie-verification build is being checked; do not treat an older artifact as the latest build. Debug APKs are review builds only, not signed release builds.

These are debug APKs for review, not production-signed release builds. The current feature work is in draft PR #1 and should not be merged until final review and deployment configuration are complete.

## Production launch gates

The code is not yet a live ride-hailing service. Render staging infrastructure is described in `render.yaml`; creating it still requires the owner to connect the Render account. Before public launch:

1. Deploy the API and managed PostgreSQL database; apply all migrations through `0027`.
2. Configure private production secrets, Google Maps/Routes and Firebase.
3. Complete POPIA, legal, security, data-retention, backup and incident-response reviews.
4. Provision owner access securely, test both apps on physical devices, verify maps/location/push and validate all fare calculations.
5. Configure Paystack only after core-product acceptance; complete sandbox checkout, refund, transfer and reconciliation tests.
6. Confirm Paystack has approved Chaufr's registered business and live transfer capability.
7. Create signed release builds only after production API configuration, signing-key setup and final acceptance testing.

See `docs/deployment.md`, `docs/owner-deployment-and-acceptance.md`, `docs/POPIA-and-e-hailing-readiness.md`, `docs/payments-identity.md` and `services/api/README.md` for the operational setup. Never commit API keys, signing keys, bank details or real identity documents.

## Optional emergency SMS configuration

Verified trusted contacts can receive emergency SMS when the API deployment has Twilio configured. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, and a random `SMS_VERIFICATION_SECRET` of at least 32 characters as server-side secrets. Never put these credentials in either Android app. Phone verification codes expire after 10 minutes and allow at most five attempts; their hashes are HMAC-protected with the verification secret. Without the provider settings, SMS is skipped while SOS events and push notifications continue.

### Production push notifications

Set `FIREBASE_SERVICE_ACCOUNT_JSON` as a server-side secret containing the Firebase service-account JSON for the same Firebase project used by the passenger and driver Android builds. The `/health` response reports whether Firebase push and Twilio emergency SMS are configured; it never returns credentials. FCM delivery now reports sent, failed and invalid-token counts and deactivates unregistered device tokens.
