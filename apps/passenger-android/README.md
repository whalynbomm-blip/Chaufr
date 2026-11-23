# Chaufr Passenger Android app

## Google Maps and address search

The passenger app uses the Google Maps SDK for Android and Google Places Autocomplete.

1. Create a Google Maps Platform project and enable **Maps SDK for Android** and **Places API**.
2. Create an Android-restricted API key. Restrict it to the Chaufr passenger application ID `za.co.chaufr.passenger` and the signing certificate SHA-1 fingerprints used for the build.
3. Add the key to your local Gradle user properties (do not commit it):

```properties
chaufrGoogleMapsApiKey=YOUR_ANDROID_RESTRICTED_KEY
```

For local builds, this is normally `~/.gradle/gradle.properties`. The repository's `.gitignore` also excludes `local.properties`, if you prefer to place the property there and load it through your local Gradle setup.

The Android key is necessarily included in the installed app. Protect it with Android application restrictions and API restrictions; do not use a server/web-service key here. Google Routes API calls must use a separate server-side key stored in the API deployment environment.

Build both apps from the repository root:

```bash
gradle :apps:passenger-android:assembleDebug :apps:driver-android:assembleDebug
```

Without the property, the app still builds, but the map and Places search remain unavailable and the screen explains that the key must be configured. For GitHub Actions APK builds, add repository Actions secrets named `GOOGLE_MAPS_ANDROID_API_KEY` and `CHAUFR_API_BASE_URL`; the workflow passes them to Gradle without storing their values in the repository. The API URL must point to the deployed HTTPS Chaufr API.

## Current integration boundary

Google Maps display and Places-based pickup/destination selection are wired into the passenger journey screen. The app requests a traffic-aware driving route from the server, displays the returned route line, and requests a fare based on the returned distance and duration. Trip submission sends the short-lived signed route quote so the server verifies the exact route measurements before creating the trip. Live driver matching, driver location tracking, trip history, receipts, payments and notifications are still outstanding.
