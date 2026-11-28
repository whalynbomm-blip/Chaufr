# Initial backend security review

**Scope:** Source-level review of the current feature branch authentication, session and HTTP rate-limit implementation. This is a preliminary review, not a penetration test or launch approval.

## Positive controls observed
- Password hashes use Node scrypt with random salt and timing-safe comparison.
- Bearer tokens are high entropy opaque tokens; only token hashes are stored.
- Session expiry and revocation are checked during authentication.
- Owner accounts cannot be created through public registration.
- Suspended and closed accounts are rejected during login and session authentication.
- Registration/login route throttles and route-preview throttles exist.
- Rate-limit storage is now bounded to avoid unbounded memory growth from unique client keys.

## Findings and remaining work

### 1. Rate limits are process-local (medium, production hardening)
The current limiters protect a single process only; their counters reset on restart and are not shared between replicas. They also key by the direct socket IP. Behind a reverse proxy, deployment configuration must decide how client IPs are safely obtained; blindly trusting forwarded headers would permit spoofing.
**Action:** implement a shared rate-limit store (e.g., Redis or managed equivalent) and explicitly configure trusted proxy handling before production.

### 2. Account ownership verification and recovery are not implemented (high launch dependency)
Registration currently creates an account and returns a session without proving control of the supplied email or phone. Password recovery/reset is not present in the reviewed authentication service.
**Action:** add verified-email/phone workflows, secure password-reset tokens, one-time-use/expiry, delivery provider integration, recovery abuse controls, and test that reset revokes all active sessions.

### 3. Session policy needs production review (medium)
Sessions currently have a 30-day expiry. There is no evidence in the reviewed auth service of a user-facing device/session list, session renewal policy, or forced logout of all sessions after password reset.
**Action:** define session policy, support revocation of all sessions for a user during credential recovery, and add session-management UI/API.

### 4. Production owner provisioning remains an operational gate
Public registration rejects owner role, which is correct. Production owner access must be provisioned securely through an audited process, and the recovery method must be tested.
**Action:** document/protect bootstrap procedure, avoid permanent bootstrap credentials, require least privilege and strong owner authentication.

### 5. Rate-limit saturation behavior is fail-closed for new keys
When the limiter is at its maximum capacity and all entries are still active, unseen keys are rejected until capacity is available. This is a deliberate memory-safety trade-off; load tests should check that legitimate users are not broadly blocked under high-cardinality traffic.
**Action:** load-test and tune limits/capacity; monitor 429 responses.

## Before launch
- Complete independent security review and threat model.
- Test role boundaries and IDOR/object ownership for all passenger, driver, owner and safety endpoints.
- Configure shared rate limiting and trusted-proxy behavior.
- Complete account verification and password recovery.
- Verify secrets management, logging redaction, backups, restore and incident-response controls.
