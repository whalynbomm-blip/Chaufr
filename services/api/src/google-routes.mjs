const invalid = (message) => Object.assign(new Error(message), { status: 400 });

function validPoint(point, label) {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw invalid(label + " coordinates are invalid");
  }
  return { latitude, longitude };
}

export function createGoogleRoutesService({
  apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY,
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    async computeRoute(originInput, destinationInput) {
      if (!apiKey) {
        throw Object.assign(new Error("Google Routes is not configured on the Chaufr server"), { status: 503 });
      }
      const origin = validPoint(originInput, "Pickup");
      const destination = validPoint(destinationInput, "Destination");
      if (origin.latitude === destination.latitude && origin.longitude === destination.longitude) {
        throw invalid("Pickup and destination must be different");
      }
      const response = await fetchImpl("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
          destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          languageCode: "en-ZA",
          units: "METRIC",
        }),
      });
      if (!response.ok) {
        const error = new Error("Google Routes could not calculate this journey");
        error.status = response.status >= 500 ? 502 : 400;
        throw error;
      }
      const payload = await response.json();
      const route = payload.routes?.[0];
      const distanceMeters = Number(route?.distanceMeters);
      const durationSeconds = Number.parseFloat(String(route?.duration ?? "").replace(/s$/, ""));
      if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 ||
          !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw Object.assign(new Error("Google Routes returned no usable route"), { status: 502 });
      }
      return {
        distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
        durationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
        encodedPolyline: route.polyline?.encodedPolyline ?? null,
        trafficAware: true,
      };
    },
  };
}
