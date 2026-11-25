import { AuthError } from "./auth-service.mjs";

const toMinor = (amount) => {
  if (!Number.isFinite(amount) || amount <= 0) throw new AuthError("Payment amount must be positive", 400);
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor) || Math.abs(amount * 100 - minor) > 0.000001) {
    throw new AuthError("Payment amount must have no more than two decimal places", 400);
  }
  return minor;
};

export function createPaymentService(pool) {
  if (!pool || typeof pool.connect !== "function") throw new TypeError("A PostgreSQL pool is required");

  return {
    async createIntent({ userId, purpose, amount, tripId = null, activationId = null }) {
      if (typeof userId !== "string" || !userId) throw new AuthError("Payment account is required", 400);
      if (!["passenger_trip", "driver_activation"].includes(purpose)) throw new AuthError("Unsupported payment purpose", 400);
      if (purpose === "passenger_trip" && (!tripId || activationId)) throw new AuthError("A passenger trip payment must reference one trip", 400);
      if (purpose === "driver_activation" && (!activationId || tripId)) throw new AuthError("A driver activation payment must reference one activation", 400);
      const amountMinor = toMinor(amount);
      const result = await pool.query(
        "INSERT INTO payment_intents (user_id, purpose, trip_id, activation_id, amount_minor, currency) " +
        "VALUES ($1, $2, $3, $4, $5, 'ZAR') RETURNING id, purpose, amount_minor, currency, status, expires_at",
        [userId, purpose, tripId, activationId, amountMinor],
      );
      return { ...result.rows[0], amount: Number(result.rows[0].amount_minor) / 100 };
    },

    // Call only after the payment provider's signature and account are verified.
    // A provider webhook handler must verify authenticity before invoking this method.
    async recordVerifiedInboundPayment({ intentId, provider, providerReference, eventId, eventType = "payment.succeeded", amount, currency = "ZAR" }) {
      if (typeof intentId !== "string" || !intentId) throw new AuthError("Payment intent is required", 400);
      for (const [value, label] of [[provider, "Provider"], [providerReference, "Provider reference"], [eventId, "Event ID"]]) {
        if (typeof value !== "string" || !value.trim() || value.length > 200) throw new AuthError(label + " is required", 400);
      }
      const receivedMinor = toMinor(amount);
      if (currency !== "ZAR") throw new AuthError("Only ZAR payments are supported", 400);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const intentResult = await client.query(
          "SELECT id, user_id, purpose, trip_id, activation_id, amount_minor, currency, status " +
          "FROM payment_intents WHERE id = $1 FOR UPDATE", [intentId],
        );
        const intent = intentResult.rows[0];
        if (!intent) throw new AuthError("Payment intent not found", 404);
        if (Number(intent.amount_minor) !== receivedMinor || intent.currency !== currency) {
          throw new AuthError("Verified payment amount or currency does not match the intent", 409);
        }
        const event = await client.query(
          "INSERT INTO payment_provider_events (provider, event_id, event_type, payment_intent_id) " +
          "VALUES ($1, $2, $3, $4) ON CONFLICT (provider, event_id) DO NOTHING RETURNING id",
          [provider.trim(), eventId.trim(), eventType, intentId],
        );
        if (!event.rowCount) {
          await client.query("COMMIT");
          return { duplicate: true, status: intent.status, intentId };
        }
        if (intent.status === "paid") {
          await client.query("COMMIT");
          return { duplicate: true, status: "paid", intentId };
        }
        if (intent.status !== "pending") throw new AuthError("Payment intent is no longer payable", 409);

        await client.query(
          "UPDATE payment_intents SET status = 'paid', provider = $2, provider_reference = $3, paid_at = now(), updated_at = now() WHERE id = $1",
          [intentId, provider.trim(), providerReference.trim()],
        );
        if (intent.purpose === "driver_activation") {
          const activation = await client.query(
            "UPDATE driver_daily_activations SET status = 'paid', payment_provider = $2, provider_reference = $3, " +
            "paid_at = now(), non_refundable_at = now(), updated_at = now() " +
            "WHERE id = $1 AND status <> 'paid' RETURNING id",
            [intent.activation_id, provider.trim(), providerReference.trim()],
          );
          if (!activation.rowCount) throw new AuthError("Driver activation is already paid or unavailable", 409);
          await client.query(
            "INSERT INTO financial_ledger (payment_intent_id, account_type, direction, amount_minor, source_reference) " +
            "VALUES ($1, 'driver_activation_revenue', 'credit', $2, $3)",
            [intentId, receivedMinor, provider + ":" + providerReference],
          );
        } else {
          const trip = await client.query(
            "UPDATE trips SET payment_status = 'paid' WHERE id = $1 AND passenger_user_id = $2 AND status <> 'cancelled' RETURNING id",
            [intent.trip_id, intent.user_id],
          );
          if (!trip.rowCount) throw new AuthError("Passenger trip is unavailable for payment", 409);
          await client.query(
            "INSERT INTO financial_ledger (payment_intent_id, trip_id, account_type, direction, amount_minor, source_reference) " +
            "VALUES ($1, $2, 'passenger_payment', 'credit', $3, $4)",
            [intentId, intent.trip_id, receivedMinor, provider + ":" + providerReference],
          );
        }
        await client.query("COMMIT");
        return { duplicate: false, status: "paid", intentId };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
