import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "./http.mjs";

const config = {
  version: "http-test-1", currency: "ZAR", baseFare: 10, perKmRate: 5,
  perMinuteRate: 1, operatingCostPerKm: 2, platformCommissionRate: 0.1,
  minimumFare: 20, fuelPricePerLitre: 25, vehicleCategories: ["standard"],
  vehicleFuelConsumptionLitresPer100Km: { standard: 8 },
};

async function withServer(run, options = {}) {
  const server = createAppServer({ fareConfig: config, ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("health endpoint reports service status", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ok");
  });
});

test("fare quote ignores client attempts to override fuel assumptions", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/v1/fare-quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        distanceKm: 10, durationMinutes: 20, vehicleCategory: "standard",
        fuelPricePerLitre: 0, fuelConsumptionLitresPer100Km: 0,
        platformCommissionRate: 0,
      }),
    });
    assert.equal(response.status, 200);
    const quote = await response.json();
    assert.equal(quote.breakdown.fuelCost, 20);
    assert.equal(quote.passengerTotal, 132);
    assert.equal(quote.fareRuleVersion, "http-test-1");
  });
});

test("fare quote rejects invalid route measurements", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/v1/fare-quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ distanceKm: -2, durationMinutes: 10, vehicleCategory: "standard" }),
    });
    assert.equal(response.status, 400);
  });
});

test("unknown routes return 404", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/not-a-route`);
    assert.equal(response.status, 404);
  });
});

test("owner console is served from the API origin", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/owner`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const page = await response.text();
    assert.match(page, /Chaufr Owner Console/);
    assert.match(page, /Owner sign in/);
  });
});


test("route preview returns a server-calculated fare and signed route token", async () => {
  const routesService = {
    computeRoute: async () => ({
      distanceKm: 4.25,
      durationMinutes: 12,
      encodedPolyline: "encoded",
      trafficAware: true,
    }),
    signRouteQuote: (origin, destination, route, quote) => {
      assert.equal(route.distanceKm, 4.25);
      assert.equal(quote.vehicleCategory, "standard");
      assert.equal(quote.fare.passengerTotal, 66.28);
      return "signed-route-token";
    },
    verifyRouteQuote: () => { throw new Error("not used in route preview test"); },
  };
  await withServer(async (base) => {
    const response = await fetch(base + "/v1/routes/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        origin: { latitude: -33.9, longitude: 18.4 },
        destination: { latitude: -33.91, longitude: 18.42 },
        vehicleCategory: "standard",
      }),
    });
    assert.equal(response.status, 200);
    const quote = await response.json();
    assert.equal(quote.distanceKm, 4.25);
    assert.equal(quote.durationMinutes, 12);
    assert.equal(quote.passengerTotal, 66.28);
    assert.equal(quote.quoteToken, "signed-route-token");
  }, { routesService });
});
