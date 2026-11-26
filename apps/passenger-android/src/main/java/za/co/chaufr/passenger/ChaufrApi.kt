package za.co.chaufr.passenger

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Calls the shared Chaufr API. Fare coefficients are never sent by the app. */
object ChaufrApi {
    suspend fun submitTripRating(baseUrl: String, token: String, tripId: String, score: Int, comment: String = ""): JSONObject =
        requestJson(baseUrl, "POST", "/v1/trips/$tripId/rating",
            JSONObject().put("score", score).put("comment", comment), token)

    suspend fun myRatings(baseUrl: String, token: String): JSONObject =
        requestJson(baseUrl, "GET", "/v1/me/ratings", token = token)

    suspend fun createSupportTicket(baseUrl: String, token: String, subject: String, message: String, category: String): JSONObject =
        requestJson(baseUrl, "POST", "/v1/support/tickets",
            JSONObject().put("subject", subject).put("message", message).put("category", category), token)

    suspend fun mySupportTickets(baseUrl: String, token: String): JSONObject =
        requestJson(baseUrl, "GET", "/v1/support/tickets", token = token)

    suspend fun registerPushDevice(baseUrl: String, token: String, fcmToken: String, deviceLabel: String): JSONObject =
        requestJson(
            baseUrl, "POST", "/v1/push-devices",
            JSONObject().put("fcmToken", fcmToken).put("platform", "android").put("deviceLabel", deviceLabel),
            token
        )

    suspend fun unregisterPushDevice(baseUrl: String, token: String, fcmToken: String): JSONObject =
        requestJson(
            baseUrl, "DELETE", "/v1/push-devices",
            JSONObject().put("fcmToken", fcmToken),
            token
        )

    suspend fun registerAccount(
        baseUrl: String, displayName: String, email: String, phone: String,
        password: String, role: String
    ): JSONObject = requestJson(
        baseUrl, "POST", "/v1/auth/register",
        JSONObject().put("displayName", displayName).put("email", email)
            .put("phone", phone).put("password", password).put("role", role)
    )

    suspend fun loginAccount(baseUrl: String, identifier: String, password: String): JSONObject =
        requestJson(
            baseUrl, "POST", "/v1/auth/login",
            JSONObject().put("identifier", identifier).put("password", password)
        )

    suspend fun currentAccount(baseUrl: String, token: String): JSONObject =
        requestJson(baseUrl, "GET", "/v1/auth/me", token = token).getJSONObject("user")

    suspend fun logoutAccount(baseUrl: String, token: String) {
        requestJson(baseUrl, "POST", "/v1/auth/logout", token = token)
    }

    suspend fun createPaymentCheckout(baseUrl: String, token: String, tripId: String): JSONObject =
        requestJson(
            baseUrl, "POST", "/v1/payments/checkout",
            JSONObject().put("purpose", "passenger_trip").put("tripId", tripId), token
        )

    private suspend fun requestJson(
        baseUrl: String, method: String, path: String,
        payload: JSONObject? = null, token: String? = null
    ): JSONObject = withContext(Dispatchers.IO) {
        require(baseUrl.startsWith("https://") || baseUrl.startsWith("http://10.0.2.2")) {
            "Configure a secure Chaufr API URL before using account services."
        }
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10000
            readTimeout = 10000
            setRequestProperty("Accept", "application/json")
            if (payload != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            if (token != null) setRequestProperty("Authorization", "Bearer $token")
        }
        try {
            if (payload != null) {
                connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val result = if (body.isBlank()) JSONObject() else JSONObject(body)
            if (status !in 200..299) {
                throw IllegalStateException(result.optString("error", "Chaufr account request failed (HTTP $status)"))
            }
            result
        } finally {
            connection.disconnect()
        }
    }

    suspend fun computeRoute(
        baseUrl: String,
        pickup: com.google.android.gms.maps.model.LatLng,
        destination: com.google.android.gms.maps.model.LatLng,
        vehicleCategory: String
    ): JSONObject = requestJson(
        baseUrl, "POST", "/v1/routes/preview",
        JSONObject()
            .put("origin", JSONObject().put("latitude", pickup.latitude).put("longitude", pickup.longitude))
            .put("destination", JSONObject().put("latitude", destination.latitude).put("longitude", destination.longitude))
            .put("vehicleCategory", vehicleCategory)
    )

    suspend fun requestTrip(
        baseUrl: String,
        token: String,
        pickupLabel: String,
        destinationLabel: String,
        origin: com.google.android.gms.maps.model.LatLng,
        destination: com.google.android.gms.maps.model.LatLng,
        vehicleCategory: String,
        routeQuoteToken: String,
        redeemReward: Boolean = false,
        serviceTier: String = "standard"
    ): JSONObject = requestJson(
        baseUrl, "POST", "/v1/trips",
        JSONObject()
            .put("pickupLabel", pickupLabel)
            .put("destinationLabel", destinationLabel)
            .put("origin", JSONObject().put("latitude", origin.latitude).put("longitude", origin.longitude))
            .put("destination", JSONObject().put("latitude", destination.latitude).put("longitude", destination.longitude))
            .put("vehicleCategory", vehicleCategory)
            .put("routeQuoteToken", routeQuoteToken)
            .put("redeemReward", redeemReward)
            .put("serviceTier", serviceTier),
        token = token
    )

    suspend fun reportSafetyParticipant(baseUrl: String, token: String, tripId: String, reportedUserId: String, reasonCode: String, notes: String): JSONObject =
        requestJson(baseUrl, "POST", "/v1/safety/report",
            JSONObject().put("tripId", tripId).put("reportedUserId", reportedUserId)
                .put("reasonCode", reasonCode).put("notes", notes), token)

    suspend fun blockSafetyParticipant(baseUrl: String, token: String, tripId: String, blockedUserId: String): JSONObject =
        requestJson(baseUrl, "POST", "/v1/safety/block",
            JSONObject().put("tripId", tripId).put("blockedUserId", blockedUserId), token)

    suspend fun createScheduledRide(baseUrl: String, token: String, booking: JSONObject): JSONObject =
        requestJson(baseUrl, "POST", "/v1/passenger/scheduled-rides", booking, token)

    suspend fun createRecurringRide(baseUrl: String, token: String, rule: JSONObject): JSONObject =
        requestJson(baseUrl, "POST", "/v1/passenger/recurring-rides", rule, token)

    suspend fun passengerScheduledRides(baseUrl: String, token: String): JSONObject =
        requestJson(baseUrl, "GET", "/v1/passenger/scheduled-rides", token = token)

    suspend fun cancelScheduledRide(baseUrl: String, token: String, id: String): JSONObject =
        requestJson(baseUrl, "DELETE", "/v1/passenger/scheduled-rides/$id", token = token)

    suspend fun cancelRecurringRide(baseUrl: String, token: String, id: String): JSONObject =
        requestJson(baseUrl, "DELETE", "/v1/passenger/recurring-rides/$id", token = token)

    suspend fun trustedContacts(baseUrl: String, token: String): JSONObject =
        requestJson(baseUrl, "GET", "/v1/passenger/trusted-contacts", token = token)

    suspend fun addTrustedContact(baseUrl: String, token: String, name: String, phone: String, relationship: String): JSONObject =
        requestJson(baseUrl, "POST", "/v1/passenger/trusted-contacts",
            JSONObject().put("contactName", name).put("phoneE164", phone).put("relationship", relationship), token)

    suspend fun deleteTrustedContact(baseUrl: String, token: String, id: String): JSONObject =
        requestJson(baseUrl, "DELETE", "/v1/passenger/trusted-contacts/$id", token = token)

    suspend fun triggerSafetySos(baseUrl: String, token: String, tripId: String, note: String = ""): JSONObject =
        requestJson(baseUrl, "POST", "/v1/safety/trips/$tripId/sos", JSONObject().put("note", note), token)

    suspend fun createTripShare(baseUrl: String, token: String, tripId: String): JSONObject =
        requestJson(baseUrl, "POST", "/v1/safety/trips/$tripId/share", token = token)

    suspend fun passengerRewards(baseUrl: String, token: String): JSONObject =
        requestJson(baseUrl, "GET", "/v1/passenger/rewards", token = token)

    suspend fun passengerTripHistory(baseUrl: String, token: String): JSONObject =
        requestJson(baseUrl, "GET", "/v1/passenger/trips/history", token = token)

    suspend fun passengerTripStatus(baseUrl: String, token: String, tripId: String): JSONObject =
        requestJson(baseUrl, "GET", "/v1/passenger/trips/$tripId/status", token = token)

    suspend fun requestPassengerRefund(baseUrl: String, token: String, tripId: String, reason: String): JSONObject =
        requestJson(baseUrl, "POST", "/v1/passenger/trips/$tripId/refund-request",
            JSONObject().put("reason", reason), token)

    suspend fun cancelPassengerTrip(baseUrl: String, token: String, tripId: String): JSONObject =
        requestJson(baseUrl, "POST", "/v1/passenger/trips/$tripId/cancel", token = token)

    suspend fun requestFareQuote(
        baseUrl: String,
        distanceKm: Double,
        durationMinutes: Double,
        vehicleCategory: String
    ): JSONObject = withContext(Dispatchers.IO) {
        require(baseUrl.startsWith("https://") || baseUrl.startsWith("http://10.0.2.2")) {
            "Configure a secure Chaufr API URL before requesting live fares."
        }
        val connection = (URL(baseUrl.trimEnd('/') + "/v1/fare-quotes").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 10000
            readTimeout = 10000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
        }
        try {
            val payload = JSONObject()
                .put("distanceKm", distanceKm)
                .put("durationMinutes", durationMinutes)
                .put("vehicleCategory", vehicleCategory)
            connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream.bufferedReader().use { it.readText() }
            if (status !in 200..299) throw IllegalStateException("Chaufr API request failed (HTTP $status)")
            JSONObject(body)
        } finally {
            connection.disconnect()
        }
    }
}
