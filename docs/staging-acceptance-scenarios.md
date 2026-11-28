# Chaufr staging acceptance scenarios (no production data)

This document is a repeatable staging test plan. Use synthetic accounts, synthetic documents and provider test modes only. It does not replace physical-device, legal or security review.

## Account and authorization
- Register passenger and driver accounts separately; confirm roles cannot be self-selected into owner.
- Attempt passenger access to driver-only APIs and driver access to passenger/owner APIs; expect denial.
- Test invalid, expired and revoked tokens; test logout/token revocation.
- Confirm owner endpoints reject non-owner sessions and all decisions/actions create audit records.
- Confirm account recovery/phone/email ownership verification are explicitly unavailable until implemented—do not imply verified identity.

## Booking, dispatch and trip state
- Quote fares for every approved band; verify ZAR and signed quote integrity; reject tampered/expired quote.
- Create a passenger booking; verify eligible drivers receive offers and one driver can accept atomically.
- Race two drivers accepting the same request; exactly one should win.
- Decline/expire offers; ensure trip remains requestable or closes according to state rules.
- Start and complete a trip only in legal sequence; test invalid transitions are rejected.
- Cancel as passenger/driver at each allowed stage; check cancellation state, fee behavior and audit trail.
- Verify completed trip history, receipts/payment status and ratings only become available at the appropriate stage.

## Driver onboarding and owner review
- Submit synthetic licence and selfie; confirm encrypted upload and restricted access.
- Verify owner can compare documents, approve/reject each item with reason and see audit trail.
- Verify rejected items require correction/resubmission and driver remains blocked from going online.
- Verify profile, vehicle approval and applicable operating-licence requirements remain independent gates.
- Attempt direct API online status without approvals; expect server-side denial.

## Safety
- Create SOS event and confirm relevant trip participants receive in-app alerts.
- Confirm UI/API does not claim emergency-service dispatch.
- Test trusted-contact CRUD, duplicate and invalid phone numbers.
- Test trip-share link expiry, revocation, access and privacy boundaries.
- Trigger route deviation/unusual-stop test events; ensure moderation records are created without false emergency claims.
- Test report/block and owner moderation flows; verify audit records.

## Scheduled and recurring rides
- Create one-off and weekday recurrence using a known South African timezone.
- Materialize due occurrences; verify duplicate prevention and correct scheduled pickup times.
- Cancel one occurrence and cancel recurrence; verify later occurrences stop.
- Restart the API worker; verify it resumes without duplicate rides or missed reminders.
- Check pickup reminders around the intended time using a controlled clock or staging fixtures.
- Verify drivers see schedule metadata only for assigned rides.

## Owner console and support
- Submit support ticket from passenger and driver; owner replies; verify correct requester sees reply.
- Confirm other users cannot view ticket, attachments or replies.
- Test document review queue, safety queue, fare settings and operations controls under owner role.
- Confirm actions are audit logged and secrets/personal documents are not exposed in logs.

## Notifications and provider failure paths
- With providers absent, API health must report providers unconfigured and flows must not pretend delivery occurred.
- With Firebase test credentials, verify invalid token, successful push and provider outage cases.
- With Twilio test configuration, verify consented external-number SMS, provider failure, delivery status and retry policy; never send test SMS to uninformed recipients.
- Confirm notifications do not contain sensitive document data or full location histories.

## Data, security and recovery
- Exercise migration chain through 0027 on an empty database and an upgrade fixture.
- Test encryption key missing/malformed startup behavior in production mode; verify encryption keys are independent.
- Check TLS settings, database access restrictions, file-size/type limits, private document storage and access controls.
- Verify sensitive data redaction in API logs and audit metadata.
- Restore a staging backup into an isolated database and run health/integrity checks.
- Run dependency checks, API tests, Android build workflows and targeted concurrency/security tests before release.

## Commercial rules regression checks
- Daily driver activation fee remains R30 and is not refundable.
- Standard trip commission remains 12%.
- Reward remains 9 tickets for one short-distance ride (5–20 minutes); reward trip commission 5%; driver receives 50% of earnings from the platform.
- Fare bands and Saver/Standard/Priority dispatch matching behavior remain unchanged unless owner explicitly approves a documented change.
- Payments stay disabled by default; do not test live transactions or payouts before the final payment stage.
