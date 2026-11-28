# Privacy, Retention and Data-Handling Checklist

This is an implementation and review checklist. It does not establish POPIA compliance; the owner must obtain appropriate legal/privacy advice and confirm applicable duties before production.

## Data minimisation and purpose

- Collect only information needed for account operation, trip safety, driver/vehicle approval, payments, support, and legal obligations.
- Clearly explain purpose, lawful basis, retention, recipients/providers, and user rights in plain language before collection.
- Do not collect sensitive documents in test/staging with real people. Use synthetic records.
- Separate driver verification files from general profile content; restrict to approved reviewers.
- Keep payment card data with the payment provider. Chaufr must not store card PAN, CVV, PIN, or bank login credentials.

## Access and handling

- Apply least privilege and role checks to owner, safety/support, driver, passenger, and provider access.
- Require strong owner authentication and protect owner sessions.
- Log access and approval/rejection actions without copying document contents or secrets into logs.
- Encrypt uploads, backups, and sensitive fields; use different keys for different environments and rotate keys through a documented process.
- Use HTTPS in production. Do not send private document URLs in public chat, logs, or tickets.
- Review third-party processor contracts, access, locations, retention, and incident obligations.

## Retention schedule — owner must confirm periods before launch

Create and approve a retention schedule for each category. Proposed categories to review:

| Category | Retention decision needed |
|---|---|
| Account/profile data | While account active; then delete or anonymise unless a lawful hold/obligation applies |
| Identity/licence/vehicle verification documents | Retain only as long as approval, legal, safety, and dispute needs justify; restrict and securely delete at expiry |
| Trip records and receipts | Period needed for disputes, accounting, tax, and applicable law |
| Location traces | Keep live trip location only for the safety/dispatch purpose and a short, approved period; avoid indefinite history |
| SOS, safety reports, moderation evidence | Case-based retention, restricted access, documented review and deletion |
| Support conversations | Approved support/dispute period; redact unnecessary sensitive information |
| Authentication/session data | Short expiry; revoke on logout, reset, compromise, or account closure |
| Analytics/telemetry | Prefer aggregate or pseudonymised; set expiry and avoid precise location/identity by default |
| Backups | Document backup window, access, expiry, and restore test; deletion in backups follows a documented cycle |

## User requests and rights workflow

- Provide a route to request access/correction, account closure, or deletion where applicable.
- Verify identity proportionately; do not collect additional documents without necessity.
- Record request date, scope, responsible reviewer, response deadline, exceptions/legal holds, and completion.
- Export only the requester’s own data; remove or redact other people’s information.
- Document how data is corrected, deleted, anonymised, or retained under an exception.

## Production sign-off

- [ ] Privacy notice and terms reviewed and published
- [ ] Information Officer/contact and incident process confirmed
- [ ] Data inventory and lawful-purpose/basis mapping approved
- [ ] Retention periods and deletion schedule approved
- [ ] Access matrix reviewed; owner access protected
- [ ] Encryption and key management verified in deployed environment
- [ ] Provider/processor agreements and cross-border considerations reviewed
- [ ] Data export, correction, closure and deletion process tested
- [ ] Breach response and required notification procedure reviewed
- [ ] Staging uses synthetic data and production documents are not stored on free/ephemeral services
