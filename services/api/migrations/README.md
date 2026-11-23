# Driver availability and dispatch data

## Passenger rewards (migration 0008)

Migration `0008_passenger_rewards.sql` adds passenger reward balances, an auditable ticket ledger, and free-ride reservations. Every completed trip awards one ticket. Nine tickets can be reserved for a 5–20 minute trip. The trip's normal quoted fare and driver earnings remain unchanged; `passenger_payable` is zero for a redeemed reward. Expired unaccepted reward trips release reserved tickets when the passenger next loads rewards or submits another trip.


Migration `0002_driver_dispatch.sql` adds the persistence model for driver online presence and individual trip offers.

## Driver presence
- One row per verified driver profile.
- Online/offline state and optional GPS coordinates.
- Last-seen timestamp supports stale-presence cleanup.
- Location bounds and accuracy validation are enforced by PostgreSQL.

## Trip offers
- Each offer belongs to one trip and one driver.
- Pending offers expire at a defined timestamp.
- Accepted, declined, expired and withdrawn are terminal response states.
- Indexes support dispatch lookup and driver pending-offer lists.

## Important implementation status
These tables are a database foundation only. The current API does not yet connect to PostgreSQL, authenticate drivers, publish live location, or dispatch/accept trip offers. Do not treat the driver's current demo availability switch as a live online status. The next backend milestone is authenticated API access and transactional repository methods that enforce one accepted driver per trip.
