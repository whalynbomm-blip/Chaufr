package za.co.chaufr.passenger

import android.location.Location
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.font.FontWeight
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.android.gms.maps.CameraUpdateFactory
import androidx.compose.runtime.LaunchedEffect
import org.json.JSONObject
import java.time.Instant
import java.time.Duration

@Composable
fun PassengerLiveTripMap(snapshot: JSONObject) {
    val route = snapshot.optJSONObject("route") ?: JSONObject()
    val pickup = route.optJSONObject("pickup")?.let { LatLng(it.optDouble("latitude"), it.optDouble("longitude")) }
    val destination = route.optJSONObject("destination")?.let { LatLng(it.optDouble("latitude"), it.optDouble("longitude")) }
    val driver = snapshot.optJSONObject("driver")
    val location = driver?.optJSONObject("location")
    val driverPoint = location?.let { LatLng(it.optDouble("latitude"), it.optDouble("longitude")) }
    val encoded = route.optString("encodedPolyline")
    val points = remember(encoded) { decodeTripPolyline(encoded) }
    val fallback = driverPoint ?: pickup ?: LatLng(-33.9249, 18.4241)
    val camera = rememberCameraPositionState()
    LaunchedEffect(driverPoint, pickup, destination) {
        camera.animate(CameraUpdateFactory.newLatLngZoom(driverPoint ?: pickup ?: destination ?: fallback, 13f))
    }
    val status = snapshot.optString("status")
    val duration = snapshot.optDouble("durationMinutes", 0.0)
    val started = snapshot.optString("startedAt")
    val elapsed = if (started.isBlank()) 0.0 else try { Duration.between(Instant.parse(started), Instant.now()).seconds.coerceAtLeast(0) / 60.0 } catch (_: Exception) { 0.0 }
    val progress = if (status == "completed") 1f else gpsProgress ?: if (status == "in_progress" && duration > 0) (elapsed / duration).toFloat().coerceIn(0f, 0.95f) else 0f
    val remaining = (duration - elapsed).coerceAtLeast(0.0)
    val gpsRouteProgress = if (status == "in_progress" && driverPoint != null) calculateRouteProgress(points, driverPoint) else null
    val gpsRemainingKm = gpsRouteProgress?.second
    val gpsProgress = gpsRouteProgress?.first
    val gpsEtaMinutes = if (gpsRemainingKm != null && snapshot.optDouble("distanceKm", 0.0) > 0 && duration > 0) {
        (gpsRemainingKm / (snapshot.optDouble("distanceKm") / duration)).toInt().coerceAtLeast(0)
    } else remaining.toInt()
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("LIVE TRIP MAP", color = Color(0xFF14243A), fontWeight = FontWeight.Bold)
            if (BuildConfig.GOOGLE_MAPS_API_KEY.isBlank()) {
                Text("Map unavailable: the Google Maps Android API key has not been configured for this build.", color = Color(0xFF64748B))
            } else {
                GoogleMap(Modifier.fillMaxWidth().height(250.dp), cameraPositionState = camera) {
                    pickup?.let { Marker(MarkerState(it), title = "Pickup") }
                    destination?.let { Marker(MarkerState(it), title = "Destination") }
                    driverPoint?.let { Marker(MarkerState(it), title = "Your driver", snippet = "Latest verified location") }
                    if (points.size > 1) Polyline(points = points, color = Color(0xFF2878F0), width = 8f)
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Estimated trip progress", color = Color(0xFF64748B), fontWeight = FontWeight.Medium)
                Text(if (status == "in_progress") "In progress" else status.replace("_", " ").replaceFirstChar { it.uppercase() }, color = Color(0xFF14243A), fontWeight = FontWeight.Bold)
            }
            LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth(), color = Color(0xFF2878F0))
            Text(
                if (status == "in_progress") {
                    if (gpsRemainingKm != null) "GPS route remaining: ${String.format("%.1f", gpsRemainingKm)} km · ETA ~${gpsEtaMinutes} min"
                    else "Route estimate: ~${remaining.toInt()} min remaining"
                } else "Route estimate: ${duration.toInt()} min",
                color = Color(0xFF14243A), fontWeight = FontWeight.SemiBold
            )
            val lastSeen = location?.optString("lastSeenAt").orEmpty()
            val ageSeconds = if (lastSeen.isBlank()) null else try {
                Duration.between(Instant.parse(lastSeen), Instant.now()).seconds.coerceAtLeast(0)
            } catch (_: Exception) { null }
            val accuracy = location?.optDouble("accuracyMeters", Double.NaN)
            Text(
                when {
                    ageSeconds == null -> "Driver GPS: waiting for a fresh location update."
                    ageSeconds <= 30 -> "Driver GPS updated ${ageSeconds}s ago" + if (accuracy != null && accuracy.isFinite()) " · accuracy ±${accuracy.toInt()} m" else ""
                    else -> "Driver GPS is ${ageSeconds}s old. The displayed position may be stale."
                },
                color = if (ageSeconds != null && ageSeconds <= 30) Color(0xFF16865B) else Color(0xFFB45309)
            )
            Text("ETA and progress are estimates from the original Google route duration and elapsed time, not live traffic or GPS-distance calculations.", color = Color(0xFF64748B))
        }
    }
}

private fun decodeTripPolyline(encoded: String): List<LatLng> {
    val points = mutableListOf<LatLng>()
    var index = 0
    var lat = 0
    var lng = 0
    while (index < encoded.length) {
        var result = 0
        var shift = 0
        var b: Int
        do { b = encoded[index++].code - 63; result = result or ((b and 0x1f) shl shift); shift += 5 } while (b >= 0x20 && index < encoded.length)
        lat += if ((result and 1) != 0) (result shr 1).inv() else result shr 1
        result = 0; shift = 0
        do { b = encoded[index++].code - 63; result = result or ((b and 0x1f) shl shift); shift += 5 } while (b >= 0x20 && index < encoded.length)
        lng += if ((result and 1) != 0) (result shr 1).inv() else result shr 1
        points.add(LatLng(lat / 1e5, lng / 1e5))
    }
    return points
}


private fun calculateRouteProgress(points: List<LatLng>, current: LatLng): Pair<Float, Double>? {
    if (points.size < 2) return null
    fun metres(a: LatLng, b: LatLng): Double {
        val result = FloatArray(1)
        Location.distanceBetween(a.latitude, a.longitude, b.latitude, b.longitude, result)
        return result[0].toDouble()
    }
    val segmentLengths = points.zipWithNext { a, b -> metres(a, b) }
    val total = segmentLengths.sum()
    if (total <= 0.0) return null
    val nearestIndex = points.indices.minByOrNull { index -> metres(points[index], current) } ?: return null
    val travelled = segmentLengths.take(nearestIndex).sum()
    val remaining = (total - travelled).coerceAtLeast(0.0)
    return ((travelled / total).toFloat().coerceIn(0f, 0.99f)) to (remaining / 1000.0)
}
