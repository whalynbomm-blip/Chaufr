# Chaufr owner handoff — deployment and physical acceptance

## Hosting decision

**Selected: Render for API + managed PostgreSQL.** It supports Docker deployment from the existing GitHub repository, health checks, managed TLS, secret environment variables and PostgreSQL. The repository includes a Render Blueprint for a temporary staging environment.

The committed Blueprint uses Render Free resources solely to let the owner test the deployment path. This is not production-grade: free web services sleep after 15 minutes idle and free PostgreSQL expires after 30 days, has no backups, and is limited to 1 GB. Never upload real passenger/driver information or identity documents to this free staging database. Before launch, upgrade to paid always-on API compute and paid PostgreSQL with backups/PITR. Current published starting prices are approximately US$7/month for a non-sleeping web service and US$6/month for the smallest paid PostgreSQL compute tier, before storage, bandwidth, tax or other usage. Check current pricing before enabling billing.

## Create staging

1. Open https://dashboard.render.com/blueprints and create a Blueprint from whalynbomm-blip/Chaufr, branch feature/payments-payouts-verification.
2. Render reads the root render.yaml; review the service/database names and confirm this is only temporary staging.
3. Supply a Google Routes server key when prompted. Restrict it to the Routes API and server use.
4. Render generates independent vehicle-data, document-data and route-quote secrets. Do not replace them with shared values.
5. After the first deploy, copy the service URL and set CHAUFR_API_BASE_URL in GitHub Actions secrets for Android review builds. Rebuild both apps after this is configured.
6. Open https://<render-service>/health. Database should show connected. Push and SMS may show not configured until those optional providers are connected.
7. Do not upload real documents, use real card payments or onboard public drivers in free staging.

## Production upgrade and secrets

Before production, create a paid Render web service and paid PostgreSQL database in the same region, attach the custom API domain, set the health check to /health, enforce HTTPS, configure database TLS as required by the selected Render connection URL, and enable backups/PITR. Use the hosting provider's secret manager for:
- DATABASE_URL
- VEHICLE_DATA_ENCRYPTION_KEY (base64 32 bytes)
- DOCUMENT_ENCRYPTION_KEY (a different base64 32 bytes)
- FARE_QUOTE_SIGNING_SECRET (random, high entropy)
- GOOGLE_MAPS_SERVER_API_KEY (server restricted, Routes API only)
- FIREBASE_SERVICE_ACCOUNT_JSON (optional until push is enabled)
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, SMS_VERIFICATION_SECRET (all four required together when SMS is enabled)
- Paystack credentials only after payment sandbox acceptance and owner approval.
- PAYOUT_DATA_ENCRYPTION_KEY only when payouts are enabled.

The API now permits Firebase and Twilio to remain unconfigured while the secure core starts; health reports these as not configured. Do not launch until push and safety-contact SMS tests pass if those channels are part of the advertised service.

## Code acceptance already automated

- API unit and PostgreSQL integration test suite runs on pushes to this feature branch and pull requests.
- CI builds the API Docker image.
- Android workflow builds passenger and driver debug APKs and uploads a combined artifact.
- PostgreSQL migrations are automatically applied in filename order at API startup, under an advisory lock. This includes migration 0027_driver_selfie_verification.sql.
- Never point a production API at a free database or allow automatic migration without a verified backup and rollback plan.

## Manual staging test script — owner must execute

- [ ] Register separate passenger, driver and owner test accounts; owner role must be provisioned privately, never via public registration.
- [ ] Upload synthetic/test licence and selfie; verify owner-only preview, face-to-licence comparison, approve/reject reason, audit trail and driver online gate.
- [ ] Test owner support reply round-trip using separate test accounts.
- [ ] Test one-off scheduled booking, recurring weekday rule, materialisation, worker restart, cancellation and duplicate prevention.
- [ ] Test map route quote, live GPS update, passenger driver marker, location staleness, route refresh and ETA on two physical Android phones.
- [ ] Test Firebase push to passenger and driver devices with notification permission granted and denied.
- [ ] Test Twilio to a consenting test phone that is not registered with Chaufr; confirm provider delivery status, not just API acceptance.
- [ ] Test SOS, trusted-contact verification, trip sharing expiry and report/block flows; confirm no claim of emergency dispatch.
- [ ] Test Paystack sandbox checkout, signed webhook, replay/idempotency, failed payment, refund, transfer failure/reversal and reconciliation. Never use live funds during acceptance.
- [ ] Test database restore from backup and key recovery. Confirm a restored database and the original encryption keys can decrypt only test documents.
- [ ] Run security review, rate-limit/abuse testing and independent penetration test before production.

## Android physical work

- Install the latest passenger and driver APKs on separate supported Android phones.
- Verify location, notification and foreground-service permissions, battery optimisation behaviour, Maps key restrictions and push token registration.
- Complete the test script above and record screenshots/logs with personal data redacted.
- APKs from CI are debug builds for testing only; a signed release build requires protected signing secrets and final production configuration.

## Items that cannot be completed by repository changes alone

The owner must connect Render, Google Cloud/Firebase, Twilio and Paystack accounts; enter their credentials in private secret managers; choose a paid production plan; register/verify the company and platform; obtain regulatory approvals; complete legal review; and perform physical acceptance on real devices. No credentials are requested in chat.
