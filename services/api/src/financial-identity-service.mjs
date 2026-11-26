import { createHmac, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv } from "node:crypto";
import { AuthError } from "./auth-service.mjs";

const minor = (amount) => Math.round(Number(amount) * 100);
const uuid = /^[0-9a-f-]{36}$/i;
const safeEqual = (a, b) => {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  return left.length === right.length && timingSafeEqual(left, right);
};

export function createPaystackService(pool, { secretKey = process.env.PAYSTACK_SECRET_KEY, webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET, fetchImpl = fetch } = {}) {
  const configured = () => {
    if (!secretKey) throw new AuthError("Paystack is not configured. Contact Chaufr support.", 503);
  };
  const call = async (path, method = "GET", body) => {
    configured();
    const response = await fetchImpl("https://api.paystack.co" + path, {
      method, headers: { authorization: "Bearer " + secretKey, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status !== true) throw new AuthError(data.message || "Payment provider request failed", 502);
    return data.data;
  };
  const payment = {
    async createCheckout(user, { purpose, tripId } = {}) {
      if (!user || !["passenger", "driver"].includes(user.role)) throw new AuthError("Passenger or driver account required", 403);
      let amount, activationId = null, email;
      if (purpose === "passenger_trip") {
        if (user.role !== "passenger" || !uuid.test(tripId ?? "")) throw new AuthError("A valid passenger trip is required");
        const trip = await pool.query(
          "SELECT id, quoted_total, status, payment_status FROM trips WHERE id=$1 AND passenger_user_id=$2",
          [tripId, user.id],
        );
        if (!trip.rowCount || ["cancelled","expired"].includes(trip.rows[0].status)) throw new AuthError("Trip cannot be paid", 409);
        if (trip.rows[0].payment_status === "paid") throw new AuthError("Trip is already paid", 409);
        amount = Number(trip.rows[0].quoted_total);
      } else if (purpose === "driver_activation") {
        if (user.role !== "driver") throw new AuthError("Driver account required", 403);
        const result = await pool.query(
          "INSERT INTO driver_daily_activations (driver_user_id, operating_date, amount, currency, status) " +
          "VALUES ($1, (now() AT TIME ZONE 'Africa/Johannesburg')::date, 30, 'ZAR', 'pending') " +
          "ON CONFLICT (driver_user_id, operating_date) DO UPDATE SET updated_at=now() " +
          "RETURNING id, amount, status",
          [user.id],
        );
        if (result.rows[0].status === "paid") throw new AuthError("Today's activation is already paid", 409);
        activationId = result.rows[0].id;
        amount = Number(result.rows[0].amount);
      } else throw new AuthError("Unsupported payment purpose");
      const userRow = await pool.query("SELECT email FROM users WHERE id=$1", [user.id]);
      email = userRow.rows[0]?.email;
      if (!email) throw new AuthError("Add and verify an email address before paying by card", 409);
      const amountMinor = minor(amount);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new AuthError("Invalid payment amount");
      const existing = await pool.query(
        "SELECT id,provider_reference,checkout_url,checkout_access_code FROM payment_intents " +
        "WHERE user_id=$1 AND purpose=$2 AND COALESCE(trip_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE($3,'00000000-0000-0000-0000-000000000000'::uuid) " +
        "AND COALESCE(activation_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE($4,'00000000-0000-0000-0000-000000000000'::uuid) " +
        "AND status='pending' AND expires_at>now() ORDER BY created_at DESC LIMIT 1",
        [user.id,purpose,purpose === "passenger_trip" ? tripId : null,activationId],
      );
      if (existing.rowCount && existing.rows[0].checkout_url) {
        return { intentId:existing.rows[0].id,reference:existing.rows[0].provider_reference,checkoutUrl:existing.rows[0].checkout_url,accessCode:existing.rows[0].checkout_access_code,amount,currency:"ZAR" };
      }
      const intent = await pool.query(
        "INSERT INTO payment_intents (user_id,purpose,trip_id,activation_id,amount_minor,currency,provider) " +
        "VALUES ($1,$2,$3,$4,$5,'ZAR','paystack') RETURNING id",
        [user.id, purpose, purpose === "passenger_trip" ? tripId : null, activationId, amountMinor],
      );
      const reference = "chf_" + randomBytes(18).toString("hex");
      const checkout = await call("/transaction/initialize", "POST", {
        email, amount: amountMinor, currency: "ZAR", reference,
        callback_url: process.env.PAYSTACK_CALLBACK_URL || undefined,
        metadata: { chaufrIntentId: intent.rows[0].id, purpose, tripId: tripId || null, userId: user.id },
      });
      await pool.query(
        "UPDATE payment_intents SET provider_reference=$2, checkout_url=$3, checkout_access_code=$4, updated_at=now() WHERE id=$1",
        [intent.rows[0].id, reference, checkout.authorization_url, checkout.access_code],
      );
      if (purpose === "passenger_trip") await pool.query("UPDATE trips SET payment_status='pending' WHERE id=$1", [tripId]);
      return { intentId: intent.rows[0].id, reference, checkoutUrl: checkout.authorization_url, accessCode: checkout.access_code, amount, currency: "ZAR" };
    },
    async handleWebhook(rawBody, signature) {
      configured();
      if (!Buffer.isBuffer(rawBody) || !signature) throw new AuthError("Invalid payment webhook", 401);
      let signatureValid = false;
      if (signature.includes("t=") && signature.includes("v1=")) {
        if (!webhookSecret) throw new AuthError("Paystack webhook signing secret is not configured", 503);
        let timestamp = null;
        const signatures = [];
        for (const part of signature.split(",")) {
          const splitAt = part.indexOf("=");
          if (splitAt < 0) continue;
          const name = part.slice(0, splitAt).trim();
          const value = part.slice(splitAt + 1).trim();
          if (name === "t") timestamp = value;
          if (name === "v1") {
            const colon = value.indexOf(":");
            if (colon > 0) signatures.push(value.slice(colon + 1));
          }
        }
        const seconds = Number(timestamp);
        if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(Date.now() / 1000) - seconds) > 300) {
          throw new AuthError("Payment webhook timestamp is outside the allowed window", 401);
        }
        const expected = createHmac("sha512", webhookSecret).update(timestamp + ".").update(rawBody).digest("hex");
        signatureValid = signatures.some((candidate) => /^[0-9a-f]{128}$/.test(candidate) && safeEqual(expected, candidate));
      } else {
        const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
        signatureValid = /^[0-9a-f]{128}$/.test(signature) && safeEqual(expected, signature);
      }
      if (!signatureValid) throw new AuthError("Invalid payment webhook signature", 401);
      let event;
      try { event = JSON.parse(rawBody.toString("utf8")); } catch { throw new AuthError("Invalid webhook payload", 400); }
      const data = event.data || {};
      const eventId = String(data.id ?? data.reference ?? "");
      if (!eventId) throw new AuthError("Webhook event reference missing", 400);
      if (event.event === "charge.failed") {
        const reference = String(data.reference ?? "");
        const failed = await pool.query(
          "UPDATE payment_intents SET status='failed',updated_at=now() WHERE provider='paystack' AND provider_reference=$1 AND status='pending' RETURNING id,purpose,trip_id,activation_id",
          [reference],
        );
        if (failed.rowCount && failed.rows[0].purpose === "passenger_trip") {
          await pool.query("UPDATE trips SET payment_status='failed' WHERE id=$1 AND payment_status='pending'", [failed.rows[0].trip_id]);
        }
        if (failed.rowCount && failed.rows[0].purpose === "driver_activation") {
          await pool.query("UPDATE driver_daily_activations SET status='failed',updated_at=now() WHERE id=$1 AND status='pending'", [failed.rows[0].activation_id]);
        }
      }
      if (event.event === "charge.success") {
        const verified = await call("/transaction/verify/" + encodeURIComponent(data.reference));
        if (verified.status !== "success" || verified.currency !== "ZAR") throw new AuthError("Payment has not been verified as successful", 409);
        const intentId = verified.metadata?.chaufrIntentId;
        if (!uuid.test(intentId ?? "")) throw new AuthError("Payment intent metadata is invalid", 409);
        const intent = await pool.query("SELECT id,amount_minor,user_id,purpose,trip_id,activation_id,status,provider_reference FROM payment_intents WHERE id=$1", [intentId]);
        if (!intent.rowCount || Number(intent.rows[0].amount_minor) !== Number(verified.amount) || intent.rows[0].provider_reference !== verified.reference) {
          throw new AuthError("Verified payment does not match Chaufr intent", 409);
        }
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const locked = await client.query("SELECT * FROM payment_intents WHERE id=$1 FOR UPDATE", [intentId]);
          if (locked.rows[0].status === "pending") {
            await client.query("UPDATE payment_intents SET status='paid',provider='paystack',provider_reference=$2,paid_at=now(),updated_at=now() WHERE id=$1", [intentId, verified.reference]);
            if (locked.rows[0].purpose === "passenger_trip") {
              await client.query("UPDATE trips SET payment_status='paid' WHERE id=$1 AND passenger_user_id=$2 AND status<>'cancelled'", [locked.rows[0].trip_id, locked.rows[0].user_id]);
              await client.query(
                "INSERT INTO financial_ledger(trip_id,account_type,direction,amount_minor,source_reference) " +
                "SELECT id,'driver_earnings','credit',round(driver_earnings * 100)::bigint,'trip-earnings:' || id::text " +
                "FROM trips WHERE id=$1 AND status='completed' AND COALESCE(fare_snapshot->>'rewardRedemption','false') <> 'true' " +
                "ON CONFLICT(account_type,source_reference) DO NOTHING",
                [locked.rows[0].trip_id],
              );
              await client.query("INSERT INTO financial_ledger(payment_intent_id,trip_id,account_type,direction,amount_minor,source_reference) VALUES($1,$2,'passenger_payment','credit',$3,$4) ON CONFLICT DO NOTHING", [intentId, locked.rows[0].trip_id, verified.amount, "paystack:"+verified.reference]);
            } else {
              await client.query("UPDATE driver_daily_activations SET status='paid',payment_provider='paystack',provider_reference=$2,paid_at=now(),non_refundable_at=now(),updated_at=now() WHERE id=$1 AND driver_user_id=$3 AND status<>'paid'", [locked.rows[0].activation_id, verified.reference, locked.rows[0].user_id]);
              await client.query("INSERT INTO financial_ledger(payment_intent_id,account_type,direction,amount_minor,source_reference) VALUES($1,'driver_activation_revenue','credit',$2,$3) ON CONFLICT DO NOTHING", [intentId, verified.amount, "paystack:"+verified.reference]);
            }
          }
          await client.query("INSERT INTO payment_provider_events(provider,event_id,event_type,payment_intent_id) VALUES('paystack',$1,$2,$3) ON CONFLICT(provider,event_id) DO NOTHING", [eventId,event.event,intentId]);
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
        finally { client.release(); }
        return { received: true, event: event.event };
      }
      if (event.event?.startsWith("transfer.")) {
        const status = event.event === "transfer.success" ? "paid" : event.event === "transfer.failed" ? "failed" : "reversed";
        const payout = await pool.query(
          "UPDATE driver_payouts SET status=$1,provider_transfer_code=$2,updated_at=now() WHERE provider_reference=$3 RETURNING id,source_type,source_id,driver_user_id,amount_minor",
          [status, data.transfer_code ?? null, data.reference],
        );
        if (payout.rowCount && status === "paid") {
          await pool.query(
            "INSERT INTO financial_ledger(account_type,direction,amount_minor,source_reference) VALUES('driver_earnings','debit',$1,$2) ON CONFLICT(account_type,source_reference) DO NOTHING",
            [payout.rows[0].amount_minor, "paystack-transfer:" + data.reference],
          );
        }
        if (payout.rowCount && payout.rows[0].source_type === "reward_commission") {
          if (status === "paid") await pool.query("UPDATE reward_driver_commission_requests SET status='paid',updated_at=now() WHERE id=$1 AND status='processing'", [payout.rows[0].source_id]);
          if (status === "failed" || status === "reversed") await pool.query("UPDATE reward_driver_commission_requests SET status='approved',updated_at=now() WHERE id=$1 AND status='processing'", [payout.rows[0].source_id]);
        }
      }
      if (event.event?.startsWith("refund.")) {
        const status = event.event === "refund.processed" ? "processed" : event.event === "refund.failed" ? "failed" : "processing";
        await pool.query("UPDATE payment_refunds SET status=$1,provider_refund_id=$2,updated_at=now() WHERE provider_reference=$3",
          [status, String(data.id ?? ""), data.reference]);
        if (status === "processed") {
          await pool.query("UPDATE payment_intents SET status='refunded',updated_at=now() WHERE id=(SELECT payment_intent_id FROM payment_refunds WHERE provider_reference=$1)", [data.reference]);
          await pool.query("UPDATE trips SET payment_status='refunded' WHERE id=(SELECT trip_id FROM payment_refunds WHERE provider_reference=$1)", [data.reference]);
        }
      }
      await pool.query("INSERT INTO payment_provider_events(provider,event_id,event_type) VALUES('paystack',$1,$2) ON CONFLICT(provider,event_id) DO NOTHING", [eventId,event.event]);
      return { received: true, event: event.event };
    },
    async createRefundRequest(passenger, tripId, reason = "Passenger cancellation") {
      if (passenger?.role !== "passenger") throw new AuthError("Passenger account required", 403);
      if (!uuid.test(tripId ?? "")) throw new AuthError("Invalid trip ID");
      const result = await pool.query(
        "SELECT p.id AS intent_id,p.amount_minor FROM payment_intents p JOIN trips t ON t.id=p.trip_id " +
        "WHERE t.id=$1 AND t.passenger_user_id=$2 AND p.status='paid' LIMIT 1",
        [tripId, passenger.id],
      );
      if (!result.rowCount) return { refundRequested: false, reason: "No settled payment exists for this trip" };
      const existing = await pool.query("SELECT id,status FROM payment_refunds WHERE trip_id=$1 AND status NOT IN ('rejected','failed') LIMIT 1", [tripId]);
      if (existing.rowCount) return { refundRequested: true, refundId: existing.rows[0].id, status: existing.rows[0].status };
      const row = result.rows[0];
      const inserted = await pool.query(
        "INSERT INTO payment_refunds(trip_id,payment_intent_id,passenger_user_id,amount_minor,reason,requested_by) " +
        "VALUES($1,$2,$3,$4,$5,$3) RETURNING id,status,amount_minor",
        [tripId, row.intent_id, passenger.id, row.amount_minor, String(reason).slice(0, 300)],
      );
      return { refundRequested: true, refundId: inserted.rows[0].id, status: inserted.rows[0].status, amount: Number(inserted.rows[0].amount_minor) / 100 };
    },
    async requestRefund(owner, refundId) {
      if (owner?.role !== "owner") throw new AuthError("Owner access required", 403);
      const row = await pool.query(
        "SELECT r.*,p.provider_reference FROM payment_refunds r JOIN payment_intents p ON p.id=r.payment_intent_id WHERE r.id=$1 AND r.status='requested'",
        [refundId],
      );
      if (!row.rowCount) throw new AuthError("Refund request not found or already processed", 404);
      const refund = row.rows[0];
      const reference = "chfr_" + randomBytes(16).toString("hex");
      const result = await call("/refund", "POST", {
        transaction: refund.provider_reference, amount: Number(refund.amount_minor),
        currency: "ZAR", customer_note: refund.reason, merchant_note: "Chaufr trip refund " + refund.trip_id, reference,
      });
      await pool.query("UPDATE payment_refunds SET status='processing',provider_reference=$2,provider_refund_id=$3,reviewed_by=$4,updated_at=now() WHERE id=$1",
        [refundId, reference, String(result.id ?? ""), owner.id]);
      await pool.query("INSERT INTO audit_events(actor_user_id,action,resource_type,resource_id,details) VALUES($1,'refund.initiated','payment_refund',$2,$3::jsonb)",
        [owner.id, refundId, JSON.stringify({ amountMinor: Number(refund.amount_minor), provider: "paystack" })]);
      return { refundId, status: "processing", providerReference: reference };
    },
    async setPayoutAccount(driver, { accountNumber, bankCode, bankName } = {}) {
      if (driver?.role !== "driver") throw new AuthError("Driver account required", 403);
      if (!/^\d{6,20}$/.test(accountNumber ?? "") || !/^\d{2,12}$/.test(bankCode ?? "") || typeof bankName !== "string" || bankName.length > 100) throw new AuthError("Valid bank details are required");
      const resolved = await call("/bank/resolve?account_number=" + encodeURIComponent(accountNumber) + "&bank_code=" + encodeURIComponent(bankCode));
      if (!resolved.account_name) throw new AuthError("The bank account could not be verified", 422);
      const recipient = await call("/transferrecipient", "POST", {
        type: "basa", name: resolved.account_name, account_number: accountNumber, bank_code: bankCode, currency: "ZAR",
      });
      const key = Buffer.from(process.env.PAYOUT_DATA_ENCRYPTION_KEY || "", "base64");
      if (key.length !== 32) throw new AuthError("Payout data encryption is not configured", 503);
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(accountNumber, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      await pool.query(
        "INSERT INTO driver_payout_accounts(driver_user_id,bank_code,bank_name,account_number_encrypted,account_name,paystack_recipient_code,status,verified_at) " +
        "VALUES($1,$2,$3,$4,$5,$6,'verified',now()) ON CONFLICT(driver_user_id) DO UPDATE SET bank_code=EXCLUDED.bank_code,bank_name=EXCLUDED.bank_name,account_number_encrypted=EXCLUDED.account_number_encrypted,account_name=EXCLUDED.account_name,paystack_recipient_code=EXCLUDED.paystack_recipient_code,status='verified',verified_at=now(),updated_at=now()",
        [driver.id, bankCode, bankName, Buffer.concat([iv,tag,encrypted]), resolved.account_name, recipient.recipient_code],
      );
      return { status: "verified", accountName: resolved.account_name, bankName };
    },
    async payDriverEarnings(owner, tripId) {
      if (owner?.role !== "owner") throw new AuthError("Owner access required", 403);
      if (!uuid.test(tripId ?? "")) throw new AuthError("Invalid trip ID");
      const trip = await pool.query(
        "SELECT t.id,t.driver_user_id,t.driver_earnings,t.fare_snapshot->>'rewardRedemption' AS reward_redemption,a.paystack_recipient_code " +
        "FROM trips t JOIN driver_payout_accounts a ON a.driver_user_id=t.driver_user_id AND a.status='verified' " +
        "WHERE t.id=$1 AND t.status='completed' AND t.payment_status='paid'",
        [tripId],
      );
      if (!trip.rowCount || trip.rows[0].reward_redemption === "true") throw new AuthError("A completed, paid standard trip and verified driver bank account are required", 409);
      const row = trip.rows[0];
      const amountMinor = minor(row.driver_earnings);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new AuthError("Trip has no payable driver earnings", 409);
      const reference = "chaufd_" + randomBytes(16).toString("hex");
      await pool.query(
        "INSERT INTO driver_payouts(driver_user_id,source_type,source_id,amount_minor,provider_reference,initiated_by) " +
        "VALUES($1,'driver_earnings',$2,$3,$4,$5)",
        [row.driver_user_id,tripId,amountMinor,reference,owner.id],
      );
      const transfer = await call("/transfer","POST",{
        source:"balance",amount:amountMinor,recipient:row.paystack_recipient_code,
        reason:"Chaufr completed trip driver earnings",reference,
      });
      await pool.query("UPDATE driver_payouts SET status='processing',provider_transfer_code=$2,updated_at=now() WHERE provider_reference=$1",
        [reference,transfer.transfer_code]);
      return { tripId, amount: amountMinor/100, status:"processing", transferCode:transfer.transfer_code };
    },
    async payRewardCommission(owner, requestId) {
      if (owner?.role !== "owner") throw new AuthError("Owner access required", 403);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const request = await client.query(
          "SELECT r.id,r.driver_user_id,r.amount,r.status,a.paystack_recipient_code FROM reward_driver_commission_requests r " +
          "JOIN driver_payout_accounts a ON a.driver_user_id=r.driver_user_id AND a.status='verified' WHERE r.id=$1 FOR UPDATE OF r",
          [requestId],
        );
        if (!request.rowCount || request.rows[0].status !== "approved") throw new AuthError("Approved payout and verified driver bank account required", 409);
        const item = request.rows[0];
        const amountMinor = minor(item.amount);
        const reference = "chaufp_" + randomBytes(16).toString("hex");
        await client.query("INSERT INTO driver_payouts(driver_user_id,source_type,source_id,amount_minor,provider_reference,initiated_by) VALUES($1,'reward_commission',$2,$3,$4,$5)",
          [item.driver_user_id, requestId, amountMinor, reference, owner.id]);
        await client.query("UPDATE reward_driver_commission_requests SET status='processing',updated_at=now() WHERE id=$1", [requestId]);
        await client.query("COMMIT");
        try {
          const transfer = await call("/transfer", "POST", { source: "balance", amount: amountMinor, recipient: item.paystack_recipient_code, reason: "Chaufr reward ride 50 percent payout", reference });
          await pool.query("UPDATE driver_payouts SET status='processing',provider_transfer_code=$2,updated_at=now() WHERE provider_reference=$1", [reference, transfer.transfer_code]);
          return { payoutId: requestId, status: "processing", transferCode: transfer.transfer_code };
        } catch (error) {
          await pool.query("UPDATE driver_payouts SET status='failed',failure_reason=$2,updated_at=now() WHERE provider_reference=$1", [reference, error.message.slice(0,300)]);
          throw error;
        }
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally { client.release(); }
    },
  };
  return payment;
}

export function createDriverVerificationService(pool, { encryptionKey = process.env.DOCUMENT_ENCRYPTION_KEY } = {}) {
  const key = Buffer.from(encryptionKey || "", "base64");
  const configured = () => { if (key.length !== 32) throw new AuthError("Document encryption is not configured", 503); };
  return {
    async upload(driver, input = {}) {
      if (driver?.role !== "driver") throw new AuthError("Driver account required", 403);
      configured();
      const allowed = new Set(["south_african_id","passport","drivers_licence","proof_of_address","vehicle_registration","vehicle_roadworthy"]);
      const types = { "image/jpeg":"jpg", "image/png":"png", "application/pdf":"pdf" };
      if (!allowed.has(input.documentType) || !types[input.mimeType] || typeof input.base64 !== "string") throw new AuthError("Unsupported document type or format");
      const bytes = Buffer.from(input.base64, "base64");
      if (!bytes.length || bytes.length > 6 * 1024 * 1024 || bytes.toString("base64").replace(/=+$/,"") !== input.base64.replace(/=+$/,"")) throw new AuthError("Document must be a valid file no larger than 6 MB");
      const validSignature = input.mimeType === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : input.mimeType === "image/png" ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        : bytes.subarray(0,5).toString("ascii") === "%PDF-";
      if (!validSignature) throw new AuthError("The uploaded file content does not match its declared file type");
      const fileName = String(input.fileName || "document." + types[input.mimeType]).replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,100);
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
      const tag = cipher.getAuthTag();
      const result = await pool.query(
        "INSERT INTO driver_verification_documents(driver_user_id,document_type,file_name,mime_type,file_size,encrypted_content,encryption_iv,encryption_tag) " +
        "VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,document_type,file_name,mime_type,file_size,status,created_at",
        [driver.id,input.documentType,fileName,input.mimeType,bytes.length,encrypted,iv,tag],
      );
      await pool.query("UPDATE driver_profiles SET verification_status='in_review' WHERE user_id=$1 AND verification_status<>'verified'", [driver.id]);
      return { document: result.rows[0] };
    },
    async listForDriver(driver) {
      if (driver?.role !== "driver") throw new AuthError("Driver account required", 403);
      const result = await pool.query("SELECT id,document_type,file_name,mime_type,file_size,status,review_note,created_at,reviewed_at FROM driver_verification_documents WHERE driver_user_id=$1 ORDER BY created_at DESC", [driver.id]);
      return { documents: result.rows };
    },
    async listForOwner(owner) {
      if (owner?.role !== "owner") throw new AuthError("Owner access required", 403);
      const result = await pool.query(
        "SELECT d.id,d.driver_user_id,u.display_name,d.document_type,d.file_name,d.mime_type,d.file_size,d.status,d.review_note,d.created_at " +
        "FROM driver_verification_documents d JOIN users u ON u.id=d.driver_user_id ORDER BY CASE d.status WHEN 'pending' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END,d.created_at ASC LIMIT 300",
      );
      return { documents: result.rows };
    },
    async readForOwner(owner, documentId) {
      if (owner?.role !== "owner") throw new AuthError("Owner access required", 403);
      configured();
      const result = await pool.query("SELECT * FROM driver_verification_documents WHERE id=$1", [documentId]);
      if (!result.rowCount) throw new AuthError("Document not found", 404);
      const d = result.rows[0];
      const iv = d.encryption_iv, tag = d.encryption_tag, ciphertext = d.encrypted_content;
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const bytes = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      await pool.query("INSERT INTO audit_events(actor_user_id,action,resource_type,resource_id,details) VALUES($1,'driver.document.viewed','driver_document',$2,'{}'::jsonb)", [owner.id,documentId]);
      return { fileName:d.file_name,mimeType:d.mime_type,base64:bytes.toString("base64") };
    },
    async review(owner, documentId, status, note = "") {
      if (owner?.role !== "owner") throw new AuthError("Owner access required", 403);
      if (!["approved","rejected","in_review"].includes(status) || typeof note !== "string" || note.length > 500) throw new AuthError("Invalid document review");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const doc = await client.query("UPDATE driver_verification_documents SET status=$1,reviewer_user_id=$2,review_note=$3,reviewed_at=now() WHERE id=$4 RETURNING driver_user_id,document_type", [status,owner.id,note,documentId]);
        if (!doc.rowCount) throw new AuthError("Document not found",404);
        const driverId = doc.rows[0].driver_user_id;
        const required = await client.query(
          "SELECT count(*) FILTER (WHERE document_type IN ('south_african_id','passport')) AS identity_count, " +
          "count(*) FILTER (WHERE document_type='drivers_licence') AS licence_count, " +
          "bool_and(status='approved') FILTER (WHERE document_type IN ('south_african_id','passport')) AS identity_ok, " +
          "bool_and(status='approved') FILTER (WHERE document_type='drivers_licence') AS licence_ok " +
          "FROM driver_verification_documents WHERE driver_user_id=$1", [driverId]);
        if (Number(required.rows[0].identity_count)>0 && Number(required.rows[0].licence_count)>0 &&
            required.rows[0].identity_ok === true && required.rows[0].licence_ok === true) {
          await client.query("UPDATE driver_profiles SET verification_status='verified' WHERE user_id=$1", [driverId]);
        } else {
          await client.query("UPDATE driver_profiles SET verification_status='in_review' WHERE user_id=$1 AND verification_status<>'suspended'", [driverId]);
          await client.query("UPDATE driver_presence SET is_online=false,updated_at=now() WHERE driver_user_id=$1", [driverId]);
        }
        await client.query("INSERT INTO audit_events(actor_user_id,action,resource_type,resource_id,details) VALUES($1,'driver.document.reviewed','driver_document',$2,$3::jsonb)",
          [owner.id,documentId,JSON.stringify({status,documentType:doc.rows[0].document_type,driverId,note})]);
        await client.query("COMMIT");
        return { documentId,status,driverId };
      } catch(error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    },
  };
}
