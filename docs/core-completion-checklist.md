# Chaufr core completion checklist

Payment gateway setup and activation are deliberately reserved for the final stage. Android builds default to `chaufrPaymentsEnabled=false`.

## 1. Passenger app
- [x] Immediate booking and server-calculated fare request.
- [x] Active trip status and driver location refresh.
- [x] Passenger trip cancellation and trip history.
- [x] Rewards balance and ticket history.
- [x] One-off and recurring scheduled ride creation.
- [x] View and cancel future one-off rides and recurring rules.
- [x] Trusted-contact add/list/remove management.
- [x] Completed-trip rating selection and support ticket creation.
- [ ] Connect a deployed API and Google Maps key; validate on physical Android devices.

## 2. Driver app
- [x] Online/offline presence flow and foreground location service.
- [x] Incoming trip offers, accept/decline, start and complete trip.
- [x] Driver profit and preference settings.
- [x] Server-backed today's/lifetime earnings and recent completed trips.
- [x] Scheduled pickup time shown on offers and current trips.
- [x] Trusted-contact add/list/remove management.
- [x] Completed-trip rating selection and support ticket creation.
- [ ] Validate background location, notification delivery and trip lifecycle on physical Android devices.

## 3. Safety Shield
- [x] SOS event recording and in-app participant/trusted-account alerts.
- [x] Trusted-contact management.
- [x] Expiring live trip-sharing links.
- [x] Route-deviation and unusual-stop heuristics.
- [x] Report/block and owner moderation workflows.
- [x] Direct emergency dialer shortcuts for South African mobile emergency (112), police (10111) and ambulance (10177).
- [ ] Configure FCM and test delivery; independently verify contact ownership.
- [ ] SMS alerts to contacts without Chaufr accounts require configured provider and delivery tests. SOS does not dispatch emergency services.

## 4. Scheduled rides
- [x] One-off and recurring weekday ride APIs.
- [x] Passenger scheduled/recurring booking list and cancellation controls.
- [x] Recurring occurrence materialization and minute worker.
- [x] One-time passenger push reminder around 30 minutes before pickup.
- [x] Driver-visible scheduled pickup label/time when the ride is dispatched.
- [ ] Verify timing, timezone, restart/recovery and notification behavior in staging and on devices.

## 5. Driver verification
- [x] Encrypted ID/passport, licence, vehicle and supporting-document uploads.
- [x] Owner review queue with approve/reject controls and reason.
- [x] Initial application requires SA driver's licence and selfie for manual comparison; PrDP is not an initial application gate.
- [x] Driver online access blocked until required profile/vehicle/document checks pass.
- [ ] Automated Home Affairs/licence-authority authenticity checks are not integrated.
- [ ] Complete POPIA, consent, retention and secure document-access review before collecting real documents.

## 6. Owner dashboard
- [x] Driver and vehicle verification.
- [x] Safety report moderation.
- [x] Support ticket inbox and owner replies.
- [x] Fare and operational controls.
- [ ] Securely provision production owner access and test audit/role boundaries after deployment.

## 7. Backend
- [x] Authenticated driver earnings endpoint and recent trip history.
- [x] Passenger history includes persisted payment status.
- [x] Scheduled reminder persistence and dispatch.
- [x] Driver earnings and passenger history unit tests.
- [ ] Email/phone ownership verification and password recovery.
- [ ] Shared/distributed rate limiting, production monitoring and stronger operational abuse controls.
- [ ] Deploy API and managed PostgreSQL; apply migrations through 0027.
- [ ] Validate migration rollback/restore strategy and backup restoration in staging.

## 8. Notifications
- [x] FCM device registration and core trip notification plumbing.
- [x] Scheduled pickup reminder event.
- [ ] Configure Firebase credentials and verify delivery on physical devices.
- [ ] Configure Twilio (optional) and verify SMS to non-Chaufr contacts; keep absent provider paths clearly reported as unavailable.

## 9. Testing
- [x] API/fare test workflow passes at latest verified commit 9786e791a0becccf21b818c81653dd4110e72d2a.
- [x] Passenger and driver Android debug builds passed at baseline af5c851; app source unchanged since.
- [ ] Run latest CI checks on commit 9786e791 after the migration-test formatting fix.
- [ ] End-to-end passenger-to-driver testing with deployed API and PostgreSQL.
- [ ] Security, concurrency, cancellation, refund and failure-path testing.
- [ ] Physical Android device acceptance testing.

## 10. Release preparation
- [x] Fresh debug APKs generated for UI review.
- [ ] Deploy staging API, database, Google Routes and Firebase.
- [ ] Configure protected Android signing key and produce signed release APKs/AABs.
- [ ] Final privacy/legal/security review and launch approval.
- [ ] Confirm owner recovery procedure and incident contacts.

## 11. Payment gateway — last
- [x] Keep Android checkout/activation UI disabled by default.
- [ ] Only after core acceptance: configure Paystack test credentials and webhooks.
- [ ] Test checkout, verified webhooks, refunds, transfers, reconciliation and payout approval.
- [ ] Enable `chaufrPaymentsEnabled=true` only after final approval.

Never set `CHAUFR_TEST_BYPASS_ACTIVATION=true` outside `NODE_ENV=development`; never enable it in production. Approved fares, commissions, rewards and matching rules must remain unchanged.

## 12. Operations and privacy
- [x] Staging acceptance test matrix drafted.
- [x] CodeQL workflow and weekly Dependabot configuration added.
- [x] Incident response runbook drafted: [incident-response-runbook.md](incident-response-runbook.md).
- [x] Privacy and data-retention checklist drafted: [privacy-retention-checklist.md](privacy-retention-checklist.md).
- [ ] Owner review and legal/privacy approval; establish retention periods, incident contacts and request workflow.
- [ ] Verify backups, restore drill, monitoring, alert thresholds and access audit trail.
