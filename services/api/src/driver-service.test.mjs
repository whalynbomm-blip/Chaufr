import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { applyMigrations } from "./database.mjs";
import { createAuthService } from "./auth-service.mjs";
import { createDriverService } from "./driver-service.mjs";
import { createTripService } from "./trip-service.mjs";
import { calculateFare } from "./fare-calculator.mjs";
import { createAppServer, developmentFareConfig } from "./http.mjs";

const databaseUrl = process.env.DATABASE_URL;
const testKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

test("driver activation gates access and accepted trips retain a locked fare", {
  skip: !databaseUrl && "DATABASE_URL is not set; PostgreSQL driver integration test skipped",
}, async () => {
  const admin = new Pool({ connectionString: databaseUrl });
  const schema = "chaufr_driver_" + process.pid + "_" + Date.now();
  await admin.query('CREATE SCHEMA "' + schema + '"');
  const pool = new Pool({
    connectionString: databaseUrl,
    options: "-c search_path=" + schema + ",public",
  });
  let server;

  try {
    await applyMigrations(pool);
    const auth = createAuthService(pool);
    const drivers = createDriverService(pool, testKey);
    const fareConfig = {
      ...developmentFareConfig(),
      vehicleCategories: ["standard", "comfort", "xl"],
    };
    const testRoute = { distanceKm: 4, durationMinutes: 7, encodedPolyline: null, trafficAware: true };
    const testFare = calculateFare({ distanceKm: 4, durationMinutes: 7, vehicleCategory: "standard", trafficLevel: "normal" }, fareConfig);
    const testRoutes = {
      computeRoute: async () => testRoute,
      signRouteQuote: () => "test-route-quote",
      verifyRouteQuote: (token, origin, destination, category) => {
        if (token !== "test-route-quote" || category !== "standard") throw Object.assign(new Error("Invalid route quote"), { status: 400 });
        return { route: testRoute, fare: testFare };
      },
    };
    const trips = createTripService(pool, fareConfig, testRoutes);
    const account = await auth.register({
      displayName: "Test Driver",
      phone: "+27821112222",
      password: "test-driver-password-123",
      role: "driver",
    });
    const passenger = await auth.register({
      displayName: "Test Passenger",
      phone: "+27821112223",
      password: "test-passenger-password-123",
      role: "passenger",
    });

    const submitted = await drivers.submitVehicle(account.user, {
      category: "standard",
      make: "Toyota",
      model: "Corolla",
      registration: "CA 123-456",
      licenceNumber: "123456789012",
      fuelConsumptionLitresPer100Km: 7.8,
    });
    assert.equal(submitted.verificationStatus, "in_review");
    assert.equal(submitted.vehicle.status, "pending");

    const stored = await pool.query(
      "SELECT v.registration_encrypted, d.licence_number_encrypted " +
      "FROM vehicles v JOIN driver_profiles d ON d.user_id = v.driver_user_id WHERE v.id = $1",
      [submitted.vehicle.id],
    );
    assert.notEqual(stored.rows[0].registration_encrypted.toString("utf8"), "CA 123-456");
    assert.notEqual(stored.rows[0].licence_number_encrypted.toString("utf8"), "123456789012");
    const profile = await drivers.getProfile(account.user);
    assert.equal(profile.vehicles.length, 1);
    assert.equal("registration" in profile.vehicles[0], false);
    assert.equal(profile.dailyActivation.isPaid, false);

    await pool.query("UPDATE driver_profiles SET verification_status = 'verified' WHERE user_id = $1", [account.user.id]);
    await pool.query("UPDATE vehicles SET status = 'approved' WHERE id = $1", [submitted.vehicle.id]);

    await assert.rejects(
      () => drivers.setPresence(account.user, { isOnline: true, latitude: -33.9, longitude: 18.4 }),
      (error) => error.status === 403 && /R30.00 daily/.test(error.message),
    );

    server = createAppServer({ database: pool, fareConfig, routesService: testRoutes });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = "http://127.0.0.1:" + server.address().port;
    const authHeader = { authorization: "Bearer " + account.accessToken };
    const passengerHeader = { authorization: "Bearer " + passenger.accessToken };

    const profileResponse = await fetch(base + "/v1/driver/profile", { headers: authHeader });
    assert.equal(profileResponse.status, 200);

    const unpaidRequests = await fetch(base + "/v1/driver/trips/available", { headers: authHeader });
    assert.equal(unpaidRequests.status, 403);

    const operatingDate = new Date().toLocaleString("sv-SE", { timeZone: "Africa/Johannesburg" }).slice(0, 10);
    const payment = {
      driverUserId: account.user.id,
      operatingDate,
      amount: 30,
      currency: "ZAR",
      provider: "test-payment-provider",
      providerReference: "test-payment-" + Date.now(),
    };
    const activated = await trips.recordVerifiedActivationPayment(payment);
    const repeated = await trips.recordVerifiedActivationPayment(payment);
    assert.equal(activated.id, repeated.id);

    const activationResponse = await fetch(base + "/v1/driver/activation", { headers: authHeader });
    assert.equal(activationResponse.status, 200);
    assert.equal((await activationResponse.json()).isPaid, true);

    const online = await fetch(base + "/v1/driver/presence", {
      method: "PUT",
      headers: { ...authHeader, "content-type": "application/json" },
      body: JSON.stringify({ isOnline: true, latitude: -33.9, longitude: 18.4, accuracyMeters: 12 }),
    });
    assert.equal(online.status, 200);
    assert.equal((await online.json()).isOnline, true);

    const initialRewardsResponse = await fetch(base + "/v1/passenger/rewards", { headers: passengerHeader });
    assert.equal(initialRewardsResponse.status, 200);
    assert.equal((await initialRewardsResponse.json()).tickets, 0);

    const requested = await fetch(base + "/v1/trips", {
      method: "POST",
      headers: { ...passengerHeader, "content-type": "application/json" },
      body: JSON.stringify({
        pickupLabel: "Cape Town Station",
        destinationLabel: "V&A Waterfront",
        routeQuoteToken: "test-route-quote",
        origin: { latitude: -33.9, longitude: 18.4 },
        destination: { latitude: -33.91, longitude: 18.42 },
        vehicleCategory: "standard",
        trafficLevel: "severe",
        platformCommissionRate: 0,
      }),
    });
    const requestedBody = await requested.json();
    assert.equal(requested.status, 201, JSON.stringify(requestedBody));
    const trip = requestedBody;
    assert.equal(trip.passengerTotal, 40);
    const passengerStatusUrl = base + "/v1/passenger/trips/" + trip.tripId + "/status";
    const initialPassengerStatus = await fetch(passengerStatusUrl, { headers: passengerHeader });
    assert.equal(initialPassengerStatus.status, 200);
    assert.equal((await initialPassengerStatus.json()).status, "requested");
    const unauthorizedStatus = await fetch(passengerStatusUrl, { headers: authHeader });
    assert.equal(unauthorizedStatus.status, 403);
    const tripHistoryResponse = await fetch(base + "/v1/passenger/trips/history", { headers: passengerHeader });
    assert.equal(tripHistoryResponse.status, 200);
    const passengerTripHistory = await tripHistoryResponse.json();
    assert.equal(passengerTripHistory.trips.length, 1);
    assert.equal(passengerTripHistory.trips[0].tripId, trip.tripId);
    assert.equal(passengerTripHistory.trips[0].status, "requested");
    assert.equal(passengerTripHistory.trips[0].passengerPayable, 40);
    assert.equal(passengerTripHistory.trips[0].pickupLabel, "Cape Town Station");
    const driverTripHistory = await fetch(base + "/v1/passenger/trips/history", { headers: authHeader });
    assert.equal(driverTripHistory.status, 403);

    const available = await fetch(base + "/v1/driver/trips/available", { headers: authHeader });
    assert.equal(available.status, 200);
    const availableBody = await available.json();
    assert.equal(availableBody.trips.length, 1);
    assert.equal(availableBody.trips[0].passengerFare, 40);
    assert.equal("platformCommission" in availableBody.trips[0], false);
    assert.equal("companyRevenue" in availableBody.trips[0], false);

    const acceptedResponse = await fetch(base + "/v1/driver/trips/" + trip.tripId + "/accept", {
      method: "POST",
      headers: authHeader,
    });
    assert.equal(acceptedResponse.status, 200);
    const accepted = await acceptedResponse.json();
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.fareLocked, true);
    assert.equal(accepted.passengerFare, 40);
    assert.equal(accepted.expectedDriverEarnings, 35.2);
    assert.equal("platformCommission" in accepted, false);
    const acceptedPassengerStatus = await fetch(passengerStatusUrl, { headers: passengerHeader });
    const acceptedStatusBody = await acceptedPassengerStatus.json();
    assert.equal(acceptedStatusBody.status, "accepted");
    assert.equal(acceptedStatusBody.driver.name, "Test Driver");
    assert.equal(acceptedStatusBody.driver.vehicle.make, "Toyota");
    assert.equal(acceptedStatusBody.driver.vehicle.model, "Corolla");
    assert.equal(acceptedStatusBody.driver.location.latitude, -33.9);
    assert.equal(acceptedStatusBody.driver.location.longitude, 18.4);
    assert.equal(acceptedStatusBody.driver.location.accuracyMeters, 12);

    const startedResponse = await fetch(base + "/v1/driver/trips/" + trip.tripId + "/start", {
      method: "POST",
      headers: authHeader,
    });
    assert.equal(startedResponse.status, 200);
    assert.equal((await startedResponse.json()).status, "in_progress");
    const inProgressPassengerStatus = await fetch(passengerStatusUrl, { headers: passengerHeader });
    assert.equal((await inProgressPassengerStatus.json()).status, "in_progress");

    const beforeCompletion = await pool.query(
      "SELECT commission_earned_at FROM trips WHERE id = $1",
      [trip.tripId],
    );
    assert.equal(beforeCompletion.rows[0].commission_earned_at, null);

    const completedResponse = await fetch(base + "/v1/driver/trips/" + trip.tripId + "/complete", {
      method: "POST",
      headers: authHeader,
    });
    assert.equal(completedResponse.status, 200);
    const completed = await completedResponse.json();
    assert.equal(completed.status, "completed");
    assert.equal(completed.commissionRecorded, true);
    assert.equal(completed.driverEarnings, 35.2);
    assert.equal("platformCommission" in completed, false);

    const locked = await pool.query(
      "SELECT fare_locked_at, quoted_total, fare_snapshot, commission_earned_at, status FROM trips WHERE id = $1",
      [trip.tripId],
    );
    assert.ok(locked.rows[0].fare_locked_at);
    assert.equal(Number(locked.rows[0].quoted_total), 40);
    assert.equal(locked.rows[0].fare_snapshot.trafficLevel, "normal");
    assert.equal(locked.rows[0].fare_snapshot.passengerTotal, 40);
    assert.ok(locked.rows[0].commission_earned_at);
    assert.equal(locked.rows[0].status, "completed");

    const earnedRewardsResponse = await fetch(base + "/v1/passenger/rewards", { headers: passengerHeader });
    assert.equal(earnedRewardsResponse.status, 200);
    const earnedRewards = await earnedRewardsResponse.json();
    assert.equal(earnedRewards.tickets, 1);
    assert.equal(earnedRewards.ticketsUntilFreeRide, 8);
    assert.equal(earnedRewards.history.length, 1);
    assert.equal(earnedRewards.history[0].type, "earned");
    assert.equal(earnedRewards.history[0].ticketsDelta, 1);
    assert.equal(earnedRewards.history[0].pickupLabel, "Cape Town Station");

    await pool.query(
      "UPDATE passenger_reward_accounts SET tickets_balance = 9 WHERE passenger_user_id = $1",
      [passenger.user.id],
    );
    const rewardTripResponse = await fetch(base + "/v1/trips", {
      method: "POST",
      headers: { ...passengerHeader, "content-type": "application/json" },
      body: JSON.stringify({
        pickupLabel: "Cape Town Station",
        destinationLabel: "V&A Waterfront",
        routeQuoteToken: "test-route-quote",
        origin: { latitude: -33.9, longitude: 18.4 },
        destination: { latitude: -33.91, longitude: 18.42 },
        vehicleCategory: "standard",
        redeemReward: true,
      }),
    });
    assert.equal(rewardTripResponse.status, 201);
    const rewardTrip = await rewardTripResponse.json();
    assert.equal(rewardTrip.passengerTotal, 0);
    assert.equal(rewardTrip.regularFare, 40);
    assert.equal(rewardTrip.rewardApplied, true);
    const rewardTripRecord = await pool.query(
      "SELECT quoted_total, passenger_payable, driver_earnings FROM trips WHERE id = $1",
      [rewardTrip.tripId],
    );
    assert.equal(Number(rewardTripRecord.rows[0].quoted_total), 40);
    assert.equal(Number(rewardTripRecord.rows[0].passenger_payable), 0);
    assert.equal(Number(rewardTripRecord.rows[0].driver_earnings), 35.2);
    const remainingRewardsResponse = await fetch(base + "/v1/passenger/rewards", { headers: passengerHeader });
    assert.equal((await remainingRewardsResponse.json()).tickets, 0);

    const rewardOfferResponse = await fetch(base + "/v1/driver/trips/available", { headers: authHeader });
    const rewardOffers = (await rewardOfferResponse.json()).trips;
    assert.equal(rewardOffers.length, 1);
    assert.equal(rewardOffers[0].passengerFare, 40);
    assert.equal(rewardOffers[0].expectedDriverEarnings, 35.2);
    const rewardAccepted = await trips.acceptTrip(account.user, rewardTrip.tripId);
    assert.equal(rewardAccepted.passengerFare, 40);
    await trips.startTrip(account.user, rewardTrip.tripId);
    const rewardCompleted = await trips.completeTrip(account.user, rewardTrip.tripId);
    assert.equal(rewardCompleted.status, "completed");
    assert.equal(rewardCompleted.commissionRecorded, false);
    const rewardAccounting = await pool.query("SELECT commission_earned_at, passenger_payable FROM trips WHERE id = $1", [rewardTrip.tripId]);
    assert.equal(rewardAccounting.rows[0].commission_earned_at, null);
    assert.equal(Number(rewardAccounting.rows[0].passenger_payable), 0);
    const afterRewardTrip = await trips.getPassengerRewards(passenger.user);
    assert.equal(afterRewardTrip.tickets, 1);
    assert.equal(afterRewardTrip.history.length, 3);
    assert.deepEqual(afterRewardTrip.history.map((entry) => entry.type), ["earned", "redeemed", "earned"]);
    assert.equal(afterRewardTrip.history[1].ticketsDelta, -9);
    assert.equal(afterRewardTrip.history[1].destinationLabel, "V&A Waterfront");
    await pool.query("UPDATE passenger_reward_accounts SET tickets_balance = 9 WHERE passenger_user_id = $1", [passenger.user.id]);
    const cancellableReward = await fetch(base + "/v1/trips", {
      method: "POST",
      headers: { ...passengerHeader, "content-type": "application/json" },
      body: JSON.stringify({
        pickupLabel: "Cape Town Station",
        destinationLabel: "V&A Waterfront",
        routeQuoteToken: "test-route-quote",
        origin: { latitude: -33.9, longitude: 18.4 },
        destination: { latitude: -33.91, longitude: 18.42 },
        vehicleCategory: "standard",
        redeemReward: true,
      }),
    });
    assert.equal(cancellableReward.status, 201);
    const cancellableTrip = await cancellableReward.json();
    const cancelResponse = await fetch(base + "/v1/passenger/trips/" + cancellableTrip.tripId + "/cancel", {
      method: "POST",
      headers: passengerHeader,
    });
    assert.equal(cancelResponse.status, 200);
    const cancellation = await cancelResponse.json();
    assert.equal(cancellation.status, "cancelled");
    assert.equal(cancellation.rewardTicketsReleased, 9);
    const cancelledStatusResponse = await fetch(base + "/v1/passenger/trips/" + cancellableTrip.tripId + "/status", { headers: passengerHeader });
    assert.equal((await cancelledStatusResponse.json()).status, "cancelled");
    const afterCancellation = await trips.getPassengerRewards(passenger.user);
    assert.equal(afterCancellation.tickets, 9);
    assert.ok(afterCancellation.history.some((entry) => entry.type === "released" && entry.ticketsDelta === 9));
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await admin.query('DROP SCHEMA "' + schema + '" CASCADE');
    await admin.end();
  }
});
