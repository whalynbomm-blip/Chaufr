# Chaufr

Chaufr is an independent South African ride-hailing platform developed as a GitHub monorepo.

## Products

- **Passenger Android app** — account access, pickup/destination selection, upfront fares, Saver/Standard/Priority matching preferences, immediate and scheduled bookings, trip status/history, rewards, card checkout, cancellations and refund requests.
- **Driver Android app** — onboarding, vehicle and document submissions, activation payment, online/offline availability, trip offers and management, earnings, payout bank onboarding and reward-ride payout requests.
- **Owner web console** — protected operations, driver and vehicle verification, safety moderation, fare configuration, refund review, payout processing and financial oversight.
- **Shared API** — PostgreSQL-backed authentication, routing/fare calculation, dispatch, payments, payouts, refunds, identity-document review, notifications and Safety Shield.

## Approved commercial rules

- Daily driver platform activation fee: **R30**, paid before the driver can go online or view offers.
- Standard trip platform commission: **12%**.
- Reward rides: **5% platform commission**; the driver may request the agreed **50% reward-ride earnings payout** through the in-app workflow.
- Reward tickets: one ticket per completed trip; nine tickets unlock an eligible short ride.
- Fare bands and service-tier matching rules are documented in `services/api/FARE-ENGINE.md` and the product requirements. Passenger and driver apps do not negotiate fares.

## Safety and convenience

The codebase includes trusted contacts, SOS event recording, 12-hour live trip-sharing links, GPS-based route-deviation/unusual-stop alerts, report/block workflows, one-off scheduled rides, recurring weekday bookings and Saver/Standard/Priority matching preferences. These features require production configuration and field testing; SOS is not an emergency-response service.

## Current verification

The feature branch `feature/payments-payouts-verification` contains the Paystack checkout/webhook integration, driver bank payout processing, cancellation refunds and encrypted driver verification-document workflow.

At commit `55835c8d334eaa7f2c481b4ba9108c8b50e16496`:
- GitHub Actions API/unit/PostgreSQL integration tests: **passed**.
- Passenger and driver Android debug builds: **passed**.
- Debug APK artifact: `chaufr-android-debug-apks`.

These are debug APKs for review, not production-signed release builds. The current feature work is in draft PR #1 and should not be merged until final review and deployment configuration are complete.

## Production launch gates

The code is not yet a live ride-hailing service. Before public launch:

1. Deploy the API and managed PostgreSQL database; apply migrations `0018`–`0021`.
2. Configure private production secrets, Google Maps/Routes and Firebase.
3. Configure Paystack test credentials and verified webhooks; complete sandbox checkout, refund and transfer tests.
4. Confirm Paystack has approved Chaufr's registered business and live transfer capability.
5. Complete POPIA, legal, security, data-retention, backup and incident-response reviews.
6. Provision owner access securely, test both apps on physical devices, verify maps/location/push and validate all fare and payout calculations.
7. Create signed release builds only after production API configuration, signing-key setup and final acceptance testing.

See `docs/deployment.md`, `docs/payments-identity.md` and `services/api/README.md` for the operational setup. Never commit API keys, signing keys, bank details or real identity documents.
