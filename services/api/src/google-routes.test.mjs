import test from "node:test";
import assert from "node:assert/strict";
import { createGoogleRoutesService } from "./google-routes.mjs";

test("Google Routes converts traffic-aware route measurements", async () => {
  let request;
  const service = createGoogleRoutesService({
    apiKey: "test-server-key",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          routes: [{
            distanceMeters: 12450,
            duration: "1320s",
            polyline: { encodedPolyline: "encoded-route" },
          }],
        }),
      };
    },
  });
  const route = await service.computeRoute(
    { latitude: -33.9, longitude: 18.4 },
    { latitude: -33.95, longitude: 18.5 },
  );
  assert.equal(route.distanceKm, 12.45);
  assert.equal(route.durationMinutes, 22);
  assert.equal(route.encodedPolyline, "encoded-route");
  assert.equal(route.trafficAware, true);
  assert.equal(request.url, "https://routes.googleapis.com/directions/v2:computeRoutes");
  assert.equal(request.options.headers["X-Goog-Api-Key"], "test-server-key");
  assert.equal(request.options.headers["X-Goog-FieldMask"], "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline");
  const body = JSON.parse(request.options.body);
  assert.equal(body.routingPreference, "TRAFFIC_AWARE");
  assert.equal(body.origin.location.latLng.latitude, -33.9);
});

test("Google Routes rejects invalid coordinates before calling provider", async () => {
  let called = false;
  const service = createGoogleRoutesService({
    apiKey: "test-server-key",
    fetchImpl: async () => { called = true; throw new Error("should not be called"); },
  });
  await assert.rejects(
    service.computeRoute({ latitude: 120, longitude: 18 }, { latitude: -33, longitude: 19 }),
    { status: 400 },
  );
  assert.equal(called, false);
});

test("Google Routes reports missing server configuration", async () => {
  const service = createGoogleRoutesService({ apiKey: "", fetchImpl: async () => { throw new Error("should not be called"); } });
  await assert.rejects(
    service.computeRoute({ latitude: -33, longitude: 18 }, { latitude: -34, longitude: 19 }),
    { status: 503 },
  );
});

test("Google Routes handles provider failures without leaking provider response", async () => {
  const service = createGoogleRoutesService({
    apiKey: "test-server-key",
    fetchImpl: async () => ({ ok: false, status: 403 }),
  });
  await assert.rejects(
    service.computeRoute({ latitude: -33, longitude: 18 }, { latitude: -34, longitude: 19 }),
    { status: 400, message: "Google Routes could not calculate this journey" },
  );
});
