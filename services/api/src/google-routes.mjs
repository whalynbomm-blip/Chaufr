import { createHmac, timingSafeEqual } from "node:crypto";

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
  signingSecret = process.env.FARE_QUOTE_SIGNING_SECRET,
  fetchImpl = globalThis.fetch,
} = {}) {
  const signRouteQuote = (originInput, destinationInput, route) => {
    if (!signingSecret) {
      throw Object.assign(new Error("Fare quote signing is not configured on the Chaufr server"), { status: 503 });
    }
    const payload = {
      origin: validPoint(originInput, "Pickup"),
      destination: validPoint(destinationInput, "Destination"),
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      encodedPolyline: route.encodedPolyline ?? null,
      trafficAware: true,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", signingSecret).update(encoded).digest("base64url");
    return encoded + "." + signature;
  };

  const verifyRouteQuote = (token, originInput, destinationInput) => {
    if (!signingSecret) throw Object.assign(new Error("Fare quote signing is not configured on the Chaufr server"), { status: 503 });
    if (typeof token !== "string" || token.length > 4096) throw invalid("A valid route quote is required");
    const [encoded, suppliedSignature, extra] = token.split(".");
    if (!encoded || !suppliedSignature || extra) throw invalid("Route quote is invalid");
    const expected = createHmac("sha256", signingSecret).update(encoded).digest();
    let actual;
    try { actual = Buffer.from(suppliedSignature, "base64url"); } catch { throw invalid("Route quote is invalid"); }
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid("Route quote is invalid");
    let payload;
    try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw invalid("Route quote is invalid"); }
    const origin = validPoint(originInput, "Pickup");
    const destination = validPoint(destinationInput, "Destination");
    if (payload.expiresAt <= Date.now()) throw Object.assign(new Error("Route quote has expired. Please calculate the fare again."), { status: 409 });
    if (payload.origin.latitude !== origin.latitude || payload.origin.longitude !== origin.longitude ||
        payload.destination.latitude !== destination.latitude || payload.destination.longitude !== destination.longitude) {
      throw invalid("Route quote does not match the selected pickup and destination");
    }
    return {
      distanceKm: payload.distanceKm,
      durationMinutes: payload.durationMinutes,
      encodedPolyline: payload.encodedPolyline ?? null,
      trafficAware: payload.trafficAware === true,
    };
  };

  return {
    signRouteQuote,
    verifyRouteQuote,
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
