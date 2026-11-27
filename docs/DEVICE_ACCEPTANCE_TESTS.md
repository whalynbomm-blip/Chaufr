# Chaufr Android device acceptance checks

These checks must be performed on physical Android devices after installing APKs built from the same commit. GitHub CI cannot verify real GPS hardware, Android background limits, notification delivery, dialer hand-off, or contact receipt.

## Safety: SOS and trusted contacts

- Use dedicated test passenger and driver accounts and a consenting test contact. Do not use a live emergency as a test.
- Add a trusted contact in each app and confirm it appears after leaving and reopening the screen.
- Start a test trip, trigger SOS once from the passenger app, and confirm the API response shows the event was recorded.
- Confirm the other trip participant receives the Chaufr push alert.
- If the trusted contact has a Chaufr account and a registered push device, confirm that device receives the alert. A phone number alone does not currently guarantee SMS delivery; an SMS provider is not configured.
- Repeat SOS from the driver app and verify the passenger alert.
- Verify that SOS controls are unavailable when there is no active trip.
- Confirm the app clearly instructs users to call 112 / 10111 / 10177 directly in an emergency.

## Trip sharing

- Create a share link from an active test trip in each app.
- Share it to a consenting test device using Android's share sheet.
- Open the link on the second device without signing in and confirm it shows trip status and fresh driver position.
- Confirm a completed, revoked or expired link is rejected.
- Confirm the link token is not stored in plaintext in the database.

## Driver GPS and battery restrictions

- Grant precise location and notification permissions; start the driver app in the foreground and go online.
- Confirm the persistent location-sharing notification appears.
- Move at least 200 metres outdoors and confirm the driver position updates on the passenger map and that the reported accuracy and last-seen age change.
- Lock the screen for 10 minutes, then repeat while Chaufr battery use is set to Optimised and Unrestricted. Record whether updates continue in each mode.
- Repeat after removing Chaufr from Samsung Sleeping apps / Deep sleeping apps, if present.
- Force-stop the app and confirm location stops; reopen and go online again to confirm the foreground service restarts.
- Go offline and confirm the foreground service and location publishing stop.
- Record Android version, device model, permission state, battery mode, last-seen age and any missed updates.

## Route progress and ETA

- Use a test route with a known encoded route polyline.
- Confirm GPS-distance progress increases as the vehicle follows the route.
- Confirm remaining route distance decreases and the traffic-aware ETA refreshes no more frequently than once per minute per trip.
- Compare the displayed ETA against Google Maps and record the difference; do not use a test result as a promise of exact arrival time.
- Test loss of GPS and stale location: the app must clearly label the last location as stale rather than implying it is live.

## Complete trip lifecycle

- Passenger creates an immediate trip; driver receives an offer.
- Driver accepts, navigates to pickup, confirms arrival, starts the trip, navigates to destination and completes it.
- Confirm the passenger receives arrival and trip-start notifications, and both histories show the final status and fare.
- Test driver cancellation before arrival and after arrival but before start; confirm the passenger is notified and any reserved reward tickets are released.
- Confirm driver cancellation is rejected once the trip is in progress.
- Create a scheduled ride and a recurring ride; confirm they appear under Passenger > My Trips.
- Cancel a scheduled ride and a recurring rule; confirm no future dispatch occurs for the cancelled booking.
- Allow a scheduled ride to reach dispatch time in a controlled test environment and confirm it becomes an ordinary driver offer.

## Evidence to record

For each check, record PASS / FAIL / BLOCKED, device model, Android version, app build commit, timestamp, screenshots or logs, and steps to reproduce. Never include real passwords, live access tokens, or private contact details in issue reports.
