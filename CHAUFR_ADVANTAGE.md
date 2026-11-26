# Chaufr Advantage — feature alignment and conflict-removal policy

This is the active product direction for Chaufr passenger and driver apps.

## Core feature set
- **FairMatch**: match passengers and drivers using passenger pickup ETA, pickup distance/unpaid burden, estimated driver net profit, and driver-preferred areas. Safety/verification/availability are eligibility gates, never weighted trade-offs.
- **Profit Intelligence**: show estimated fare, commission, driver gross, pickup distance, fuel/operating-cost estimate, and net profit before accepting an offer. Estimates are clearly labeled and recalculated with driver-editable vehicle costs.
- **Safety Shield**: mutual verified profiles, emergency/SOS entry point, trusted-contact trip sharing, unusual-stop/route-deviation alerts (informational, configurable, false-positive tolerant), safe pickup/drop-off guidance, report/block controls. No automatic accusations or discriminatory risk scoring.
- **Passenger choice**: optional Saver (longer flexible pickup), Standard, Priority (quicker pickup) only if operationally feasible; all fare and ETA details shown before confirming. Preserve locked fare after driver accepts.
- **Scheduled/recurring commute matching** and **Advantage rewards/benefits hub** are later feature phases after the core real-world ride loop is stable.

## Conflict removals / superseded behaviors
1. Remove dispatch's **nearest-driver-only / shortest-ETA-only** selection as the sole objective. Keep ETA and distance as components, not the whole decision.
2. Remove/avoid any **fare-only race to the bottom** and any fare display that hides driver commission, pickup burden, or estimated net from the driver.
3. Remove any **unsafe trade-off** in matching: unverified, unpaid-activation, unapproved vehicle, unavailable/busy driver, or explicitly safety-ineligible driver must never be offered a ride.
4. Avoid duplicative/contradictory fare modes: use one server-side locked fare calculation and clearly named ride-choice modifiers; do not expose older legacy fare configuration as a second competing price system in production.
5. Keep existing daily R30 activation + 12% standard-trip commission until owner explicitly changes it. Rewards-trip special rule remains 5% commission and driver requests 50% of eligible driver earnings via the in-app request workflow. Do not merge reward ride economics with standard rides.
6. Do not enable live tracking, sharing, SOS, or safety alerts without clear permissions, privacy controls, and appropriate notification behavior. Safety controls must not require a passenger to disclose contacts.

## Implementation phases
- Phase 1 (current): shared decision/profit calculation module, unit tests, documented conflict policy.
- Phase 2: integrate FairMatch scoring into dispatch; migrate schema/settings for driver preferences and vehicle cost inputs; store explainable score components in dispatch event; retain safety hard gates.
- Phase 3: driver offer card profit breakdown and passenger ETA/fare choice; safety-profile, trip-sharing, SOS/report/block UX and backend controls.
- Phase 4: recurring rides, Advantage rewards/benefits, operational monitoring and abuse controls.

## Design guardrails
- Explain match score components; never use protected traits.
- Profit figures are estimates, not guarantees; use transparent defaults and editable assumptions.
- Do not suppress dispatch simply because profit estimate is negative unless driver-configured minimums are enabled and confirmed.
- No feature should create a hidden fee, change an accepted fare, or override passenger/driver cancellation rights.
