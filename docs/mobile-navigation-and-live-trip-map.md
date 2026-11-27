# Chaufr mobile navigation and live trip map

## Objective

Give the passenger and driver Android apps a clear, section-based navigation system without removing existing capabilities or changing approved commercial rules. Keep a shared visual language (Chaufr navy/blue, white surfaces, consistent typography, iconography and spacing), while keeping each role's workflows distinct.

## Navigation model

Use a persistent five-destination bottom navigation bar. Each destination opens a dedicated screen with its own title, content and scroll state. Less frequently used tools live in a structured More screen. Do not place every feature on one scrolling dashboard.

### Passenger destinations

1. **Home** — Start your journey, pickup and destination selection, route preview, fare quote, Saver/Standard/Priority selection and ride request.
2. **My Trips** — Active trip, scheduled and recurring rides, trip history, cancellations and receipts. When a trip is active, show a prominent return-to-trip action.
3. **Rewards** — Ticket balance, progress to the nine-ticket reward, eligibility and reward history.
4. **Safety** — SOS event/reporting, trusted contacts, trip sharing, emergency dialer shortcuts and safety information. Clearly state that the app does not dispatch emergency services.
5. **More** — Wallet and payment methods (remain unavailable while payment activation is disabled), refunds, profile/account, verification, ratings, support tickets, notifications and settings.

### Driver destinations

1. **Home** — Availability and activation state, incoming offers, current-trip shortcut and service status.
2. **My Trips** — Current trip, accepted/arriving/pickup/in-progress/completed states, scheduled pickups and trip history.
3. **Earnings** — Daily and lifetime totals, completed trips, commission breakdown, reward-ride earnings and payout history. Clearly label unsettled amounts as indicative until payment settlement is live.
4. **Safety** — SOS event/reporting, trusted contacts, trip sharing, emergency dialer shortcuts and safety information. Clearly state that the app does not dispatch emergency services.
5. **More** — Driver profile, vehicle, identity/licence document status, ratings and feedback, support tickets, notifications and settings. Bank/payout controls remain hidden while payments are disabled.

## Live trip map

The active-trip screen in both apps must contain a real Google Map, not a static illustration.

### Passenger map

- Show passenger pickup and destination markers.
- Show the driver's latest GPS position after a driver is assigned and sharing location.
- Draw the available route polyline and update it when a refreshed route is supplied.
- Display trip status, driver/vehicle details, ETA and last location update.
- Poll trip status/location while the trip is active; stop polling after completed, cancelled or expired.
- Provide trip sharing and Safety Centre entry points.
- Before driver assignment, show pickup/destination and route preview without inventing a driver marker or ETA.

### Driver map

- Show the driver's current GPS position, pickup and destination.
- Show the route appropriate to the current phase (driver-to-pickup, then pickup-to-destination).
- Display navigation handoff, distance/ETA when supplied by the routing service, passenger pickup details and trip status.
- Continue location sharing only under the app's explicit online/active-trip permissions and visible foreground-service notification.
- Stop location sharing when the driver goes offline or the trip/session ends, according to the existing service lifecycle.

## Live data contract and truthfulness

The UI must render only server/GPS/routing values actually received. Never animate a fake vehicle or fabricate ETA, traffic, route progress or GPS coordinates.

The authenticated active-trip response should provide, when available:
- trip id and canonical status;
- pickup and destination labels and coordinates;
- assigned driver's display name and vehicle summary (passenger view);
- latest driver latitude/longitude, accuracy and server-received timestamp;
- route polyline for the current leg;
- ETA and remaining distance with a timestamp/source;
- location freshness/staleness indicator.

The driver location endpoint/service must persist and expose the latest permitted location to the passenger assigned to that trip only. Enforce trip membership and authorization server-side. Do not expose a driver's location to unrelated passengers or after the trip's authorized sharing window. Apply rate limits and retain only the location history needed for the trip/safety purpose.

If location permission, network, API, Maps key or route data is unavailable, show an explicit unavailable/stale state and retain the last known value with its timestamp. Do not present stale data as live.

## Implementation sequence

1. Add role-specific navigation shell and dedicated destination screens, extracting existing feature panels into the appropriate destinations without deleting or duplicating business logic.
2. Move existing active-trip content into My Trips and integrate the Google Maps composables in both apps.
3. Connect passenger map markers to the authorized live driver-location field returned by the active-trip API; connect driver map to actual device GPS and current trip coordinates.
4. Add refresh lifecycle, stale-location UI, permission handling, route refresh and tests for completed/cancelled trips.
5. Run API tests and build both Android debug APKs. Test on physical devices with real backend, Maps/Routes key, Firebase and location permissions before calling the map live or production-ready.

## Non-negotiable compatibility rules

- Preserve existing account, booking, matching, scheduled ride, recurring ride, trip, reward, safety, support, verification and earnings workflows.
- Preserve the R30 daily driver activation fee, 12% standard commission, reward ride 5% platform commission and 50% driver reward-ride payout rule.
- Preserve all approved fare bands and Saver/Standard/Priority matching behavior.
- Keep card checkout, refunds, bank payout and payment controls disabled until the final payment-provider stage and explicit production configuration.
- Do not merge the existing draft pull request without the owner's approval.
