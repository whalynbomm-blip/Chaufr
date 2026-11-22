import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "./http.mjs";

const config = {
  version: "test-1", currency: "ZAR", baseFare: 10, perKmRate: 5,
  perMinuteRate: 1, operatingCostPerKm: 2, platformCommissionRate: 0.1,
  minimumFare: 20, vehicleCategories: ["standard"],
};

async function withServer(run) {
  const server = createAppServer({ fareConfig: config });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("health endpoint returns service status", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ok");
  });
});

test("fare quote endpoint calculates fixed fare", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/v1/fare-quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        distanceKm: 10, durationMinutes: 20, fuelPricePerLitre: 25,
        fuelConsumptionLitresPer100Km: 8, vehicleCategory: "standard",
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.passengerTotal, 132);
    assert.equal(body.status, "estimated");
    assert.equal(body.fareRuleVersion, "test-1");
  });
});

test("fare quote endpoint rejects invalid input", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/v1/fare-quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ distanceKm: -3 }),
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
