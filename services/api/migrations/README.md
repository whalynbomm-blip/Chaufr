# Chaufr database migrations

The API applies pending SQL migrations in filename order at startup when `DATABASE_URL` is configured. Migrations are tracked in `schema_migrations` and protected by a PostgreSQL advisory lock. Do not edit an already-applied migration; add a new numbered migration instead.

## Feature map

- `0001` — core users, driver profiles, vehicles, trips and trip events.
- `0002` — driver online presence and dispatch offers.
- `0003` — revocable authenticated sessions.
- `0004`–`0007` — daily driver activation records, fare locking, commission recognition and approved fare-band changes.
- `0008`–`0009` — passenger reward-ticket balances, auditable ticket ledger, reward redemption reservations and driver reward-commission requests.
- `0010` — sequential smart dispatch.
- `0011` — Firebase push-device registration.
- `0012` — provider-neutral payment ledger.
- `0013` — driver profit and preference settings.
- `0014` — Safety Shield reports, blocks and moderation.
- `0015`–`0017` — one-off and recurring scheduling, live trip sharing, safety tracking and hardening.
- `0018`–`0021` — encrypted identity/document workflows, payout processing and retry-safe payout records. Payment gateway activation is intentionally deferred until the core product is complete.
- `0022` — passenger/driver trip ratings.
- `0023` — customer-support tickets and owner replies.
- `0024` — one-time scheduled-pickup reminder tracking.

## Important operating rules

- Driver presence and trip offers are authenticated API operations; a driver must be verified and meet activation requirements before going online or accessing offers.
- `CHAUFR_TEST_BYPASS_ACTIVATION=true` is accepted only when `NODE_ENV=development`. It exists solely for local/pre-payment end-to-end testing. Never set it in production.
- Scheduled rides are materialized and dispatched by the API worker. Passengers can cancel future one-off rides and recurring rules; recurring cancellation also cancels not-yet-dispatched occurrences.
- Reward-ticket redemption is supported for immediate eligible rides. Future scheduled bookings use the standard fare until reward reservation/cancellation handling is added.
- Safety and notification heuristics require production configuration and real-world testing. SOS is not an emergency-response service.
- Never store real credentials, bank account numbers, or identity documents in Git.
