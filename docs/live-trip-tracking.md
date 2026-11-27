# Chaufr live trip maps and tracking

## Current mobile implementation

Both Android apps now include a Google Maps trip view on the active-trip screen.

- Passenger app: the assigned driver's most recent location, pickup and destination markers, saved Google route polyline, trip status and route-time estimate.
- Driver app: the driver's last reported GPS position, pickup and destination markers, saved Google route polyline, trip status and route-time estimate.
- Driver location continues to be reported by the existing foreground location service while the driver is online. The persistent Android notification explains that location sharing is active.
- Passenger trip status refreshes every 8 seconds. Driver current-trip details refresh every 10 seconds.
- The API only returns driver coordinates for the passenger who owns that trip. Coordinates older than 90 seconds are withheld.

## ETA accuracy

The current displayed remaining time is an estimate derived from the original Google route duration minus elapsed trip time. It is not a continuously recalculated traffic ETA. The app labels this limitation so passengers and drivers are not misled.

True live ETA requires a deployed Google Routes/traffic refresh strategy and a backend endpoint that recalculates remaining route time from the latest GPS point to the destination. Do not replace missing route or location data with simulated movement or invented values.

## Required production configuration

- Set the GitHub Actions secret `GOOGLE_MAPS_ANDROID_API_KEY` to a restricted Android Maps SDK key enabled for both Chaufr application IDs.
- Set `CHAUFR_API_BASE_URL` to the deployed HTTPS API.
- Apply the existing database migrations, including driver presence and trip tables.
- Grant driver foreground location permissions. Android may require the user to enable precise location and allow background operation according to device policy.
- Ensure the driver remains online during an active trip so the foreground location service can publish updates.

## Device acceptance tests

Run these on at least one passenger and one driver Android phone (including Samsung One UI):

1. Sign in to the two accounts and confirm driver activation/verification prerequisites.
2. Grant location permissions; driver goes online and sees the persistent location notification.
3. Request and accept a ride. Confirm both apps show the same pickup, destination and route.
4. Walk/drive a short safe test route. Confirm passenger driver marker changes after location updates and is not stale.
5. Start the trip; confirm status and progress update on both apps.
6. Disable GPS/network temporarily; confirm stale coordinates are withheld and no fake location appears.
7. End the trip; confirm active map stops polling and trip appears in history.
8. Repeat with battery optimisation enabled and disabled; document OEM-specific background restrictions.

CI compilation is not a substitute for these physical-device tests.
