# Chaufr Incident Response Runbook

This runbook is for the owner/operator and the technical team. It is a response guide, not a guarantee that monitoring or emergency services are active.

## 1. Severity and first response

- **SEV-1 — Safety, security, or widespread outage:** suspected identity/document exposure, account takeover of owner or driver, payment compromise, SOS/trip-sharing failure during an active safety incident, or platform unavailable for most users.
- **SEV-2 — Major function degraded:** dispatch/acceptance failures, maps/GPS broadly failing, payment or onboarding unavailable, or scheduled trips not dispatching.
- **SEV-3 — Limited issue:** one user/device, cosmetic bug, isolated notification or support issue.

For every incident: record start time, affected service/users, severity, reporter, and incident lead. Keep a factual timeline; do not post identity documents, tokens, full phone numbers, payment details, or private trip URLs in public tickets.

## 2. Safety incident

1. Prioritize the rider/driver's immediate safety; the app is not an emergency dispatcher.
2. If danger is immediate, instruct them to use the device emergency dialer or local emergency services (South Africa: 112 mobile; 10111 police; 10177 ambulance).
3. Preserve relevant event IDs and logs with minimal personal data. Do not delay immediate safety assistance for evidence collection.
4. Restrict access to compromised accounts or links only where this does not impede a person's safety; revoke/expire sharing links when safe and appropriate.
5. Escalate to the designated owner/safety contact; document actions and follow up.

## 3. Security or privacy incident

1. Stop the exposure or abuse safely; disable a vulnerable endpoint/provider integration or revoke affected sessions/keys if needed.
2. Do not delete evidence. Save timestamps, event IDs, affected systems, and sanitized logs.
3. Rotate secrets suspected of exposure. Never put new secrets in commits, issue comments, chat screenshots, or APKs.
4. Restrict privileged access and preserve audit logs.
5. Assess the categories of personal information and affected people, whether access was unauthorized, and the likely impact.
6. Follow South African POPIA breach assessment and notification duties with qualified advice; notify the Information Regulator and affected data subjects when legally required. Avoid premature public claims.
7. Record corrective actions, owner, due date, and a post-incident review.

## 4. Payment incident

- Disable new payment attempts or payouts if the provider reports compromise, duplicate charges, unexplained payout changes, or reconciliation mismatch.
- Keep payment processing in sandbox/disabled mode until the cause is understood.
- Never manually mark a payment paid based only on a screenshot or client response. Verify using trusted provider records and webhook/event IDs.
- Preserve idempotency keys, transaction references, timestamps, and reconciliation results.
- Reconcile provider settlement records with Chaufr records before resuming.

## 5. Outage and recovery

1. Check API health, database connectivity, provider status, and deployment changes.
2. Roll back the last known risky deployment if rollback is safe and available.
3. Avoid destructive database changes; preserve data and backups.
4. Confirm health and a small end-to-end test before announcing recovery.
5. Update users with a short, factual notice and next update time if known.

## 6. Communication template

**Chaufr service notice**

- Status: investigating / mitigating / monitoring / resolved
- Started: [time and date, timezone]
- Impact: [affected functions; no sensitive data]
- Workaround: [safe workaround or none]
- Next update: [time or when more information is available]

## 7. Closure and review

- Record root cause (or explicitly unknown), impact, timeline, mitigation, and evidence links.
- Track follow-up work with accountable owner and deadline.
- Review whether detection, access controls, testing, backup, and user communications should change.
- Remove temporary access and confirm rotated secrets are no longer in use.
