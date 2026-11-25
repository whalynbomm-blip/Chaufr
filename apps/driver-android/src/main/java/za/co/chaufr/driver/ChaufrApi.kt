package za.co.chaufr.driver

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Calls the shared Chaufr API. Fare coefficients are never sent by the app. */
object ChaufrApi {
    suspend fun currentDriverTrip(baseUrl: String, token: String): JSONObject =
        requestJson(baseUrl, "GET", "/v1/driver/trips/current", token = token)

    suspend fun startTrip(baseUrl: String, token: String, tripId: String): JSONObject =
        requestJson(baseUrl, "POST", "/v1/driver/trips/$tripId/start", token = token)

    suspend fun completeTrip(baseUrl: String, token: String, tripId: String): JSONObject =
        requestJson(baseUrl, "POST", "/v1/driver/trips/$tripId/complete", token = token)

    suspend fun requestRewardCommission(baseUrl: String, token: String, tripId: String): JSONObject =
        requestJson(baseUrl, "POST", "/v1/driver/trips/$tripId/reward-commission-request", token = token)

    suspend fun availableTrips(baseUrl: String, token: String): JSONObject =
        requestJson(baseUrl, "GET", "/v1/driver/trips/available", token = token)

    suspend fun acceptTrip(baseUrl: String, token: String, tripId: String): JSONObject =
        requestJson(baseUrl, "POST", "/v1/driver/trips/$tripId/accept", token = token)

    suspend fun declineTrip(baseUrl: String, token: String, tripId: String): JSONObject =
        requestJson(baseUrl, "POST", "/v1/driver/trips/$tripId/decline", token = token)

    suspend fun driverProfile(baseUrl: String, token: String): JSONObject =
        requestJson(baseUrl, "GET", "/v1/driver/profile", token = token)

    suspend fun submitDriverVehicle(
        baseUrl: String, token: String, category: String, make: String, model: String,
        registration: String, licenceNumber: String, fuelConsumption: Double
    ): JSONObject = requestJson(
        baseUrl, "POST", "/v1/driver/vehicles",
        JSONObject()
            .put("category", category)
            .put("make", make)
            .put("model", model)
            .put("registration", registration)
            .put("licenceNumber", licenceNumber)
            .put("fuelConsumptionLitresPer100Km", fuelConsumption),
        token
    )

    suspend fun setDriverPresence(
        baseUrl: String, token: String, isOnline: Boolean,
        latitude: Double? = null, longitude: Double? = null, accuracyMeters: Double? = null
    ): JSONObject {
        val body = JSONObject().put("isOnline", isOnline)
        if (latitude != null && longitude != null) {
            body.put("latitude", latitude).put("longitude", longitude)
            if (accuracyMeters != null) body.put("accuracyMeters", accuracyMeters)
        }
        return requestJson(baseUrl, "PUT", "/v1/driver/presence", body, token)
    }


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
