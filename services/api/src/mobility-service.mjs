import { createHash, randomBytes } from "node:crypto";
import { AuthError } from "./auth-service.mjs";
import { offerTripToNextDriver } from "./dispatch-service.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIERS = new Set(["saver", "standard", "priority"]);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const member = (user) => {
  if (!user || !["passenger", "driver"].includes(user.role)) throw new AuthError("Passenger or driver account required", 403);
};
const clean = (value, field, max = 160) => {
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > max) throw new AuthError(field + " is invalid");
  return value.trim();
};
const validPoint = (point) => point && Number.isFinite(Number(point.latitude)) &&
  Number(point.latitude) >= -90 && Number(point.latitude) <= 90 &&
  Number.isFinite(Number(point.longitude)) && Number(point.longitude) >= -180 && Number(point.longitude) <= 180;

function schedulePayload(input, routesService) {
  if (!validPoint(input.origin) || !validPoint(input.destination)) throw new AuthError("Valid pickup and destination coordinates are required");
  if (!TIERS.has(input.serviceTier ?? "standard")) throw new AuthError("Choose Saver, Standard or Priority");
  if (typeof input.routeQuoteToken !== "string" || !input.routeQuoteToken) throw new AuthError("Refresh the route estimate before scheduling");
  const verified = routesService.verifyRouteQuote(input.routeQuoteToken, input.origin, input.destination, input.vehicleCategory);
  const redeemReward = input.redeemReward === true;
  if (redeemReward && (verified.route.durationMinutes < 5 || verified.route.durationMinutes > 20)) {
    throw new AuthError("A free ride reward can only be used on a journey lasting 5 to 20 minutes");
  }
  return {
    pickupLabel: clean(input.pickupLabel, "Pickup"),
    destinationLabel: clean(input.destinationLabel, "Destination"),
    origin: { latitude: Number(input.origin.latitude), longitude: Number(input.origin.longitude) },
    destination: { latitude: Number(input.destination.latitude), longitude: Number(input.destination.longitude) },
    vehicleCategory: input.vehicleCategory,
    serviceTier: input.serviceTier ?? "standard",
    redeemReward,
    verified,
  };
}

function fareSnapshot(payload) {
  const { route, fare } = payload.verified;
  return {
    pricingMode: fare.pricingMode, fareRuleVersion: fare.fareRuleVersion, currency: fare.currency,
    distanceKm: route.distanceKm, durationMinutes: route.durationMinutes,
    encodedPolyline: route.encodedPolyline, trafficAware: route.trafficAware,
    vehicleCategory: payload.vehicleCategory, trafficLevel: "normal", serviceTier: payload.serviceTier,
    passengerTotal: fare.passengerTotal, driverEarnings: fare.breakdown.driverEarnings,
    platformCommission: fare.breakdown.platformCommission, breakdown: { ...fare.breakdown },
    rewardRedemption: payload.redeemReward, pickupLocation: payload.origin,
  };
}

export function createMobilityService(pool, routesService, pushService = null) {
  const notify = async (userId, title, body, data) => {
    if (pushService && userId) {
      try { await pushService.sendToUser(userId, { title, body, data }); } catch { /* notification failure must not block safety action */ }
    }
  };
  async function createTripFromPayload(client, passengerId, payload) {
    const snapshot = fareSnapshot(payload);
    const fare = payload.verified.fare;
    const regularFare = Number(fare.passengerTotal);
    const commission = payload.redeemReward ? Math.round(regularFare * 0.05 * 100) / 100 : Number(fare.breakdown.platformCommission);
    const earnings = payload.redeemReward ? Math.round((regularFare - commission) * 100) / 100 : Number(fare.breakdown.driverEarnings);
    snapshot.driverEarnings = earnings;
    snapshot.platformCommission = commission;
    snapshot.breakdown.driverEarnings = earnings;
    snapshot.breakdown.platformCommission = commission;
    const result = await client.query(
      "INSERT INTO trips (passenger_user_id,status,pickup_label,destination_label,distance_km,duration_minutes,quoted_total,passenger_payable,driver_earnings,platform_commission,quote_inputs,quote_expires_at,traffic_level,fare_snapshot,commission_rate) " +
      "VALUES ($1,'requested',$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,now()+interval '5 minutes','normal',$11::jsonb,$12) RETURNING id",
      [passengerId,payload.pickupLabel,payload.destinationLabel,snapshot.distanceKm,snapshot.durationMinutes,regularFare,payload.redeemReward?0:regularFare,earnings,commission,JSON.stringify(snapshot),JSON.stringify(snapshot),payload.redeemReward?0.05:0.12],
    );
    return result.rows[0].id;
  }

  return {
    async createScheduledRide(user, input = {}) {
      member(user);
      if (user.role !== "passenger") throw new AuthError("Passenger account required", 403);
      const payload = schedulePayload(input, routesService);
      const when = new Date(input.scheduledFor);
      if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() + 30 * 60_000 || when.getTime() > Date.now() + 90 * 86400_000) {
        throw new AuthError("Choose a pickup time at least 30 minutes and no more than 90 days ahead");
      }
      const result = await pool.query(
        "INSERT INTO scheduled_rides (passenger_user_id,scheduled_for,pickup_label,destination_label,origin,destination,route_quote_token,vehicle_category,service_tier,redeem_reward) " +
        "VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10) RETURNING id,scheduled_for,status",
        [user.id,when,payload.pickupLabel,payload.destinationLabel,JSON.stringify(payload.origin),JSON.stringify(payload.destination),
          JSON.stringify({route:payload.verified.route,fare:payload.verified.fare,vehicleCategory:payload.vehicleCategory,serviceTier:payload.serviceTier,redeemReward:payload.redeemReward}),
          payload.vehicleCategory,payload.serviceTier,payload.redeemReward],
      );
      return { ...result.rows[0], scheduledFor: result.rows[0].scheduled_for, serviceTier: payload.serviceTier };
    },

    async createRecurringRide(user, input = {}) {
      member(user);
      if (user.role !== "passenger") throw new AuthError("Passenger account required", 403);
      const payload = schedulePayload(input, routesService);
      const weekdays = [...new Set(input.weekdays ?? [])].map(Number);
      if (!weekdays.length || weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) throw new AuthError("Select one or more weekdays (Monday=1, Sunday=7)");
      const start = String(input.startsOn ?? "");
      const end = String(input.endsOn ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) throw new AuthError("Choose a valid recurring ride date range");
      const localTime = String(input.localTime ?? "");
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) throw new AuthError("Choose a pickup time in HH:MM format");
      if ((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000 > 180) throw new AuthError("Recurring rides can be set up for a maximum of 180 days at a time");
      const stored = JSON.stringify({route:payload.verified.route,fare:payload.verified.fare,vehicleCategory:payload.vehicleCategory,serviceTier:payload.serviceTier,redeemReward:payload.redeemReward});
      const result = await pool.query(
        "INSERT INTO recurring_ride_rules (passenger_user_id,pickup_label,destination_label,origin,destination,route_quote_token,vehicle_category,service_tier,weekdays,local_time,starts_on,ends_on,redeem_reward) " +
        "VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9::smallint[],$10::time,$11::date,$12::date,$13) RETURNING id,status,starts_on,ends_on,weekdays,local_time",
        [user.id,payload.pickupLabel,payload.destinationLabel,JSON.stringify(payload.origin),JSON.stringify(payload.destination),stored,payload.vehicleCategory,payload.serviceTier,weekdays,localTime,start,end,payload.redeemReward],
      );
      return { rule: result.rows[0], serviceTier: payload.serviceTier, timezone: "Africa/Johannesburg" };
    },

    async listScheduledRides(user) {
      member(user);
      const [scheduled, recurring] = await Promise.all([
        pool.query("SELECT id,scheduled_for,status,trip_id,pickup_label,destination_label,service_tier FROM scheduled_rides WHERE passenger_user_id=$1 ORDER BY scheduled_for DESC LIMIT 100",[user.id]),
        pool.query("SELECT id,status,weekdays,local_time,starts_on,ends_on,pickup_label,destination_label,service_tier FROM recurring_ride_rules WHERE passenger_user_id=$1 ORDER BY created_at DESC LIMIT 100",[user.id]),
      ]);
      return { scheduled: scheduled.rows, recurring: recurring.rows };
    },

    async cancelSchedule(user, scheduleId, recurring = false) {
      member(user);
      if (!UUID.test(String(scheduleId))) throw new AuthError("Schedule ID is invalid");
      const table = recurring ? "recurring_ride_rules" : "scheduled_rides";
      const result = await pool.query(
        "UPDATE " + table + " SET status='cancelled',updated_at=now() WHERE id=$1 AND passenger_user_id=$2 AND status IN ('scheduled','active') RETURNING id,status",
        [scheduleId,user.id],
      );
      if (!result.rowCount) throw new AuthError("Active scheduled ride not found",404);
      if (recurring) await pool.query("UPDATE scheduled_ride_occurrences SET status='cancelled' WHERE rule_id=$1 AND status='scheduled'",[scheduleId]);
      return result.rows[0];
    },

    async processDueScheduledRides(limit = 25) {
      const due = await pool.query(
        "SELECT id,passenger_user_id,scheduled_for,pickup_label,destination_label,origin,destination,route_quote_token,vehicle_category,service_tier,redeem_reward " +
        "FROM scheduled_rides WHERE status='scheduled' AND scheduled_for <= now() + interval '2 minutes' ORDER BY scheduled_for LIMIT $1",
        [limit],
      );
      const dispatched = [];
      for (const row of due.rows) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const lock = await client.query("UPDATE scheduled_rides SET status='dispatching',updated_at=now() WHERE id=$1 AND status='scheduled' RETURNING id",[row.id]);
          if (!lock.rowCount) { await client.query("ROLLBACK"); continue; }
          const saved = JSON.parse(row.route_quote_token);
          const payload = {
            pickupLabel:row.pickup_label,destinationLabel:row.destination_label,
            origin:row.origin,destination:row.destination,vehicleCategory:row.vehicle_category,
            serviceTier:row.service_tier,redeemReward:row.redeem_reward,verified:saved,
          };
          const tripId = await createTripFromPayload(client,row.passenger_user_id,payload);
          await client.query("UPDATE scheduled_rides SET status='dispatched',trip_id=$2,updated_at=now() WHERE id=$1",[row.id,tripId]);
          await client.query("COMMIT");
          const dispatch = await offerTripToNextDriver(pool,tripId,payload.origin,routesService);
          dispatched.push({ scheduleId:row.id,tripId,dispatchStatus:dispatch.status });
          await notify(row.passenger_user_id,"Your scheduled Chaufr ride is now active","We are finding your driver for the booked pickup.",{type:"scheduled_ride_dispatched",tripId});
        } catch (error) {
          await client.query("ROLLBACK");
          await pool.query("UPDATE scheduled_rides SET status='failed',updated_at=now() WHERE id=$1 AND status='dispatching'",[row.id]);
          dispatched.push({ scheduleId:row.id,error:error.message });
        } finally { client.release(); }
      }
      return { processed:dispatched.length,dispatched };
    },

    async addTrustedContact(user,input={}) {
      member(user);
      const name=clean(input.contactName,"Contact name",80);
      const phone=String(input.phoneE164??"").trim();
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new AuthError("Use an international phone number, for example +27821234567");
      const relationship=typeof input.relationship==="string"?input.relationship.trim().slice(0,40):"";
      const result=await pool.query(
        "INSERT INTO trusted_contacts(user_id,contact_name,phone_e164,relationship) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,phone_e164) DO UPDATE SET contact_name=EXCLUDED.contact_name,relationship=EXCLUDED.relationship RETURNING id,contact_name,phone_e164,relationship,verified_at,created_at",
        [user.id,name,phone,relationship]);
      return result.rows[0];
    },

    async listTrustedContacts(user) {
      member(user);
      const result=await pool.query("SELECT id,contact_name,phone_e164,relationship,verified_at,created_at FROM trusted_contacts WHERE user_id=$1 ORDER BY created_at",[user.id]);
      return { contacts:result.rows };
    },

    async deleteTrustedContact(user,contactId) {
      member(user);
      if (!UUID.test(String(contactId))) throw new AuthError("Contact ID is invalid");
      const result=await pool.query("DELETE FROM trusted_contacts WHERE id=$1 AND user_id=$2 RETURNING id",[contactId,user.id]);
      if (!result.rowCount) throw new AuthError("Trusted contact not found",404);
      return { deleted:true };
    },

    async triggerSos(user,tripId,input={}) {
      member(user);
      if (!UUID.test(String(tripId))) throw new AuthError("Trip ID is invalid");
      const trip=await pool.query("SELECT id,passenger_user_id,driver_user_id,pickup_label,destination_label,status FROM trips WHERE id=$1 AND (passenger_user_id=$2 OR driver_user_id=$2)",[tripId,user.id]);
      const row=trip.rows[0];
      if (!row) throw new AuthError("Trip not found",404);
      if (!["accepted","in_progress","driver_arriving"].includes(row.status)) throw new AuthError("SOS is available only for an active trip",409);
      const contacts=await pool.query("SELECT contact_name,phone_e164 FROM trusted_contacts WHERE user_id=$1",[user.id]);
      const event=await pool.query("INSERT INTO trip_safety_events(trip_id,actor_user_id,event_type,details) VALUES($1,$2,'sos',$3::jsonb) RETURNING id,created_at",
        [tripId,user.id,JSON.stringify({note:typeof input.note==="string"?input.note.slice(0,300):"",contactCount:contacts.rowCount})]);
      const otherId=user.id===row.passenger_user_id?row.driver_user_id:row.passenger_user_id;
      await notify(otherId,"Chaufr Safety SOS","The other trip participant has triggered an SOS. Follow your emergency procedures.",{type:"safety_sos",tripId});
      return {eventId:event.rows[0].id,createdAt:event.rows[0].created_at,contacts:contacts.rows.map(c=>({name:c.contact_name,phoneE164:c.phone_e164})),message:"SOS recorded and the other trip participant was alerted where push delivery is available. Trusted-contact SMS/calling requires a configured messaging provider; if you are in immediate danger, call local emergency services."};
    },

    async createTripShare(user,tripId) {
      member(user);
      if (!UUID.test(String(tripId))) throw new AuthError("Trip ID is invalid");
      const trip=await pool.query("SELECT id,status FROM trips WHERE id=$1 AND (passenger_user_id=$2 OR driver_user_id=$2)",[tripId,user.id]);
      if (!trip.rowCount) throw new AuthError("Trip not found",404);
      if (!["accepted","in_progress","driver_arriving"].includes(trip.rows[0].status)) throw new AuthError("Trip sharing is available for active trips",409);
      const token=randomBytes(32).toString("base64url");
      const result=await pool.query("INSERT INTO trip_share_tokens(trip_id,owner_user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '12 hours') RETURNING expires_at",[tripId,user.id,hash(token)]);
      await pool.query("INSERT INTO trip_safety_events(trip_id,actor_user_id,event_type,details) VALUES($1,$2,'share_created','{}'::jsonb)",[tripId,user.id]);
      return {shareToken:token,expiresAt:result.rows[0].expires_at};
    },

    async getSharedTrip(token) {
      if (typeof token!=="string" || token.length<32 || token.length>100) throw new AuthError("Share link is invalid",404);
      const result=await pool.query(
        "SELECT t.status,t.pickup_label,t.destination_label,t.requested_at,t.started_at,p.latitude,p.longitude,p.last_seen_at " +
        "FROM trip_share_tokens s JOIN trips t ON t.id=s.trip_id LEFT JOIN driver_presence p ON p.driver_user_id=t.driver_user_id " +
        "WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() LIMIT 1",[hash(token)]);
      if (!result.rowCount) throw new AuthError("Share link is invalid or expired",404);
      const r=result.rows[0];
      return {status:r.status,pickupLabel:r.pickup_label,destinationLabel:r.destination_label,requestedAt:r.requested_at,startedAt:r.started_at,
        driverLocation:r.last_seen_at && Date.now()-new Date(r.last_seen_at).getTime()<90000?{latitude:Number(r.latitude),longitude:Number(r.longitude),lastSeenAt:r.last_seen_at}:null};
    },

    async evaluateDriverLocation(driver,latitude,longitude) {
      if (!validPoint({latitude,longitude})) return {alerts:[]};
      const active=await pool.query(
        "SELECT t.id,t.passenger_user_id,t.fare_snapshot->>'encodedPolyline' AS polyline,t.status,t.started_at " +
        "FROM trips t WHERE t.driver_user_id=$1 AND t.status IN ('accepted','in_progress') ORDER BY t.accepted_at DESC LIMIT 1",[driver.id]);
      const trip=active.rows[0];
      if (!trip || !trip.polyline) return {alerts:[]};
      const coords=decodePolyline(trip.polyline);
      if (coords.length<2) return {alerts:[]};
      const deviation=distanceToPolylineKm(Number(latitude),Number(longitude),coords);
      const elapsed=trip.started_at?Date.now()-new Date(trip.started_at).getTime():0;
      const alerts=[];
      if (trip.status==="in_progress" && deviation>0.8) alerts.push({type:"route_deviation",deviationKm:Number(deviation.toFixed(2))});
      if (trip.status==="in_progress" && elapsed>12*60_000 && deviation<0.15) {
        const last=await pool.query("SELECT created_at FROM trip_safety_events WHERE trip_id=$1 AND event_type='unusual_stop' ORDER BY created_at DESC LIMIT 1",[trip.id]);
        if (!last.rowCount || Date.now()-new Date(last.rows[0].created_at).getTime()>10*60_000) alerts.push({type:"unusual_stop"});
      }
      for (const alert of alerts) {
        await pool.query("INSERT INTO trip_safety_events(trip_id,actor_user_id,event_type,details) VALUES($1,$2,$3,$4::jsonb)",[trip.id,driver.id,alert.type,JSON.stringify(alert)]);
        await notify(trip.passenger_user_id,alert.type==="route_deviation"?"Chaufr route alert":"Chaufr stop alert",
          alert.type==="route_deviation"?"Your driver appears to be away from the planned route.":"Your trip may have stopped unexpectedly.",
          {type:alert.type,tripId:trip.id});
      }
      return {alerts};
    },
  };
}

function decodePolyline(encoded) {
  const points=[]; let index=0,lat=0,lng=0;
  while(index<encoded.length) {
    let b,shift=0,result=0;
    do { b=encoded.charCodeAt(index++)-63; result|=(b&0x1f)<<shift; shift+=5; } while(b>=0x20 && index<encoded.length);
    lat+=(result&1)?~(result>>1):(result>>1);
    shift=0;result=0;
    do { b=encoded.charCodeAt(index++)-63; result|=(b&0x1f)<<shift; shift+=5; } while(b>=0x20 && index<encoded.length);
    lng+=(result&1)?~(result>>1):(result>>1);
    points.push({lat:lat/1e5,lng:lng/1e5});
  }
  return points;
}
function distanceToPolylineKm(lat,lng,points) {
  const meanLat=lat*Math.PI/180;
  const x=(value)=>value*Math.PI/180*6371*Math.cos(meanLat);
  const y=(value)=>value*Math.PI/180*6371;
  const px=x(lng),py=y(lat); let best=Infinity;
  for(let i=1;i<points.length;i++) {
    const ax=x(points[i-1].lng),ay=y(points[i-1].lat),bx=x(points[i].lng),by=y(points[i].lat);
    const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
    const t=den?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/den)):0;
    best=Math.min(best,Math.hypot(px-(ax+t*dx),py-(ay+t*dy)));
  }
  return best;
}
