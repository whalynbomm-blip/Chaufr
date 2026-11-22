package za.co.chaufr.passenger

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Calls the shared Chaufr API. Fare coefficients are never sent by the app. */
object ChaufrApi {
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
