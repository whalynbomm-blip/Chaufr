import test from "node:test";
import assert from "node:assert/strict";
import { createMobilityService } from "./mobility-service.mjs";

const tripId = "123e4567-e89b-12d3-a456-426614174000";
const passengerId = "123e4567-e89b-12d3-a456-426614174001";
const driverId = "123e4567-e89b-12d3-a456-426614174002";
const contactUserId = "123e4567-e89b-12d3-a456-426614174003";

test("SOS records an event and alerts the other trip participant and linked trusted contacts", async () => {
  const calls = [];
  const notifications = [];
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (String(sql).startsWith("SELECT id,passenger_user_id")) {
        return { rowCount: 1, rows: [{ id: tripId, passenger_user_id: passengerId, driver_user_id: driverId, status: "in_progress" }] };
      }
      if (String(sql).startsWith("SELECT contact_name,phone_e164")) {
        return { rows: [{ contact_name: "Emergency Contact", phone_e164: "+27821234567" }] };
      }
      if (String(sql).startsWith("INSERT INTO trip_safety_events")) {
        return { rows: [{ id: 77, created_at: "2026-11-27T10:00:00Z" }] };
      }
      if (String(sql).startsWith("SELECT id FROM users WHERE phone_e164")) {
        return { rowCount: 1, rows: [{ id: contactUserId }] };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const service = createMobilityService(pool, null, {
    async sendToUser(userId, payload) { notifications.push({ userId, payload }); },
  });
  const result = await service.triggerSos({ id: passengerId, role: "passenger" }, tripId, { note: "Need help" });
  assert.equal(result.eventId, 77);
  assert.equal(result.contacts.length, 1);
  assert.equal(notifications.length, 2);
  assert.deepEqual(notifications.map((item) => item.userId).sort(), [contactUserId, driverId].sort());
  assert.ok(calls.some((call) => call.sql.includes("'sos'")));
});

test("trip sharing creates a high-entropy link and stores only its hash", async () => {
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (String(sql).startsWith("SELECT id,status FROM trips")) return { rowCount: 1, rows: [{ id: tripId, status: "in_progress" }] };
      if (String(sql).startsWith("INSERT INTO trip_share_tokens")) return { rows: [{ expires_at: "2026-11-27T22:00:00Z" }] };
      return { rows: [], rowCount: 1 };
    },
  };
  const service = createMobilityService(pool);
  const result = await service.createTripShare({ id: driverId, role: "driver" }, tripId);
  assert.ok(result.shareToken.length >= 40);
  assert.equal(result.expiresAt, "2026-11-27T22:00:00Z");
  const tokenInsert = calls.find((call) => call.sql.startsWith("INSERT INTO trip_share_tokens"));
  assert.ok(tokenInsert);
  assert.notEqual(tokenInsert.params[2], result.shareToken);
  assert.equal(tokenInsert.params[0], tripId);
});

test("SOS and trip sharing reject trips that are not active", async () => {
  const pool = {
    async query(sql) {
      if (String(sql).startsWith("SELECT id,passenger_user_id")) {
        return { rowCount: 1, rows: [{ id: tripId, passenger_user_id: passengerId, driver_user_id: driverId, status: "completed" }] };
      }
      if (String(sql).startsWith("SELECT id,status FROM trips")) return { rowCount: 1, rows: [{ id: tripId, status: "completed" }] };
      return { rows: [] };
    },
  };
  const service = createMobilityService(pool);
  await assert.rejects(
    service.triggerSos({ id: passengerId, role: "passenger" }, tripId),
    /active trip/i,
  );
  await assert.rejects(
    service.createTripShare({ id: driverId, role: "driver" }, tripId),
    /active trips/i,
  );
});

test("trusted contact phone verification sends a one-time code and confirms ownership", async () => {
  const previousSecret=process.env.SMS_VERIFICATION_SECRET;
  process.env.SMS_VERIFICATION_SECRET="test-secret-that-is-at-least-32-characters-long";
  let storedHash=null, smsBody="";
  const pool={async query(sql,params=[]) {
    if(String(sql).startsWith("SELECT id,phone_e164 FROM trusted_contacts")) return {rowCount:1,rows:[{id:"123e4567-e89b-12d3-a456-426614174004",phone_e164:"+27821234567"}]};
    if(String(sql).startsWith("UPDATE trusted_contacts SET verification_code_hash=")){storedHash=params[2];return {rowCount:1,rows:[]};}
    if(String(sql).startsWith("SELECT verification_code_hash")) return {rowCount:1,rows:[{verification_code_hash:storedHash,verification_expires_at:new Date(Date.now()+600000),verification_attempts:0}]};
    if(String(sql).startsWith("UPDATE trusted_contacts SET verified_at=")) return {rowCount:1,rows:[]};
    return {rowCount:1,rows:[]};
  }};
  const service=createMobilityService(pool,null,null,{isConfigured:()=>true,async send(_to,body){smsBody=body;return {sent:true};}});
  const contactId="123e4567-e89b-12d3-a456-426614174004";
  try {
    assert.deepEqual(await service.requestTrustedContactVerification({id:passengerId,role:"passenger"},contactId),{sent:true,expiresInSeconds:600});
    const code=smsBody.match(/code is (\\d{6})/)[1];
    assert.ok(storedHash);
    const verified=await service.confirmTrustedContactVerification({id:passengerId,role:"passenger"},contactId,{code});
    assert.equal(verified.verified,true);
  } finally {
    if(previousSecret===undefined) delete process.env.SMS_VERIFICATION_SECRET;
    else process.env.SMS_VERIFICATION_SECRET=previousSecret;
  }
});
