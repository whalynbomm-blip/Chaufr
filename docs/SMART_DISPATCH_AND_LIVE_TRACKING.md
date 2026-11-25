# Chaufr Smart Dispatch and Live Trip Tracking

## Status
Planned for implementation. This document records the approved product scope; it does not claim the runtime features are already live.

## Smart Dispatch

When a passenger requests a trip, Chaufr should offer it to the best eligible driver rather than relying on every driver to race to accept the same request.

Eligibility:
- Driver is verified, online, and has paid the current South African operating day's non-refundable R30 activation fee.
- Driver has an approved, active vehicle matching the passenger's selected vehicle category.
- Driver has no accepted or in-progress trip.
- Driver location is recent and has valid coordinates.

Ranking:
1. Estimated time to pickup using Google Routes traffic-aware routing where configured.
2. Road distance to pickup as a fallback/tie-breaker.
3. Driver rating and recent acceptance/cancellation reliability as secondary tie-breakers.
4. Never rank an ineligible driver above an eligible driver.

Offer lifecycle:
- Create a dispatch offer with a short expiry window.
- Notify the selected driver and show pickup, destination, trip duration, fare and expected driver earnings.
- First valid acceptance atomically assigns the trip; concurrent or expired acceptances must be rejected.
- If declined or timed out, offer to the next eligible driver.
- If no driver accepts, keep the passenger informed and allow retry/cancellation.
- Do not expose platform commission, company revenue, or other drivers' private details to drivers.

## Live tracking

- Driver app sends location updates while online and more frequently during an accepted trip.
- Use Android foreground location service during an active trip, with clear persistent notification and permission handling.
- Validate coordinates, accuracy and timestamps server-side; reject stale or impossible updates.
- Passenger trip status returns the assigned driver's latest location and timestamp only to that trip's passenger.
- Passenger app displays the driver on Google Maps, refreshes location while the trip is active, and shows a stale-location indicator if updates stop.
- Show the route to pickup before pickup and the trip route after the driver starts the trip.
- Stop active-trip tracking after completion or cancellation; retain only the minimum location history required for operational and safety purposes.

## Reliability, privacy and safety

- Enforce one active trip per driver and one active offer per trip with database constraints/transactions.
- Do not publish a driver's location to unrelated passengers.
- Do not treat an old location as live; expose last-seen time.
- Add audit events for offer, decline, timeout, assignment and trip status changes.
- Handle poor connectivity with retry/backoff and a visible last-updated time.
- Keep fare locked when the trip is accepted; dispatch must not alter the agreed fare or existing reward/commission rules.

## Implementation sequence

1. Database-backed dispatch offers, expiry and atomic assignment.
2. Eligibility and candidate ranking using current presence, activation, vehicle and active-trip state.
3. Driver offer notifications and passenger dispatch status.
4. Android foreground location tracking during online/active-trip states.
5. Passenger Google Maps live marker and route rendering.
6. Integration tests for concurrent accepts, timeout/fallback, stale GPS, privacy boundaries and completed-trip shutdown.

## Acceptance criteria

- A passenger request is automatically offered to the best eligible nearby driver.
- A declined/expired offer proceeds to the next eligible driver.
- Two drivers cannot both accept the same trip.
- An ineligible, unpaid, unverified, offline, busy or stale-location driver is never dispatched.
- Passenger sees the assigned driver's moving map marker and last update time.
- Only the passenger on the assigned trip can see that driver's trip location.
- Existing fare, daily activation, 9-ticket reward and reward-commission rules remain unchanged.
