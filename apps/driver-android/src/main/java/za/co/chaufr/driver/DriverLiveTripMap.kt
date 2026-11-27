package za.co.chaufr.driver

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import org.json.JSONObject
import java.time.Instant
import java.time.Duration

@Composable
fun DriverLiveTripMap(trip: JSONObject) {
    val context = LocalContext.current
    val route = trip.optJSONObject("route") ?: JSONObject()
    val pickup = route.optJSONObject("pickup")?.let { LatLng(it.optDouble("latitude"), it.optDouble("longitude")) }
    val destination = route.optJSONObject("destination")?.let { LatLng(it.optDouble("latitude"), it.optDouble("longitude")) }
    val driverLocation = trip.optJSONObject("driverLocation")
    val driverPoint = driverLocation?.let { LatLng(it.optDouble("latitude"), it.optDouble("longitude")) }
        ?: lastKnownDriverLocation(context)
    val encoded = route.optString("encodedPolyline")
    val points = remember(encoded) { decodeDriverPolyline(encoded) }
    val camera = rememberCameraPositionState()
    LaunchedEffect(driverPoint, pickup, destination) {
        camera.animate(CameraUpdateFactory.newLatLngZoom(driverPoint ?: pickup ?: destination ?: LatLng(-33.9249,18.4241), 13f))
    }
    val status = trip.optString("status")
    val duration = trip.optDouble("durationMinutes", 0.0)
    val started = trip.optString("startedAt")
    val elapsed = remember(started, status) {
        if (started.isBlank()) 0.0 else try { Duration.between(Instant.parse(started), Instant.now()).seconds.coerceAtLeast(0) / 60.0 } catch (_: Exception) { 0.0 }
    }
    val progress = if (status == "in_progress" && duration > 0) (elapsed / duration).toFloat().coerceIn(0f,0.95f) else 0f
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("LIVE NAVIGATION", color = Color(0xFF14243A), fontWeight = FontWeight.Bold)
            if (BuildConfig.GOOGLE_MAPS_API_KEY.isBlank()) {
                Text("Map unavailable: configure GOOGLE_MAPS_ANDROID_API_KEY in GitHub Actions secrets.", color = Color(0xFF64748B))
            } else {
                GoogleMap(Modifier.fillMaxWidth().height(250.dp), cameraPositionState = camera) {
                    pickup?.let { Marker(MarkerState(it), title = "Pickup") }
                    destination?.let { Marker(MarkerState(it), title = "Destination") }
                    driverPoint?.let { Marker(MarkerState(it), title = "Your current GPS position", snippet = "Device location") }
                    if (points.size > 1) Polyline(points = points, color = Color(0xFF2878F0), width = 8f)
                }
            }
            Text(if (status == "accepted") "Navigate to pickup" else "Navigate to destination", color = Color(0xFF14243A), fontWeight = FontWeight.SemiBold)
            LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth(), color = Color(0xFF2878F0))
            Text(if (status == "in_progress") "Route estimate: about ${(duration - elapsed).coerceAtLeast(0.0).toInt()} min remaining" else "Planned route: ${duration.toInt()} min · ${String.format("%.1f", trip.optDouble("distanceKm"))} km", color = Color(0xFF64748B))
            Text("Route and ETA use the original Google route estimate. Follow road signs and drive safely.", color = Color(0xFF64748B))
        }
    }
}

private fun lastKnownDriverLocation(context: Context): LatLng? {
    val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    if (!fine && !coarse) return null
    val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    return try {
        val location = if (fine) manager.getLastKnownLocation(LocationManager.GPS_PROVIDER) ?: manager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER) else manager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
        location?.let { LatLng(it.latitude, it.longitude) }
    } catch (_: SecurityException) { null }
}

private fun decodeDriverPolyline(encoded: String): List<LatLng> {
    val points = mutableListOf<LatLng>(); var index=0; var lat=0; var lng=0
    while(index<encoded.length) {
        var result=0; var shift=0; var b:Int
        do { b=encoded[index++].code-63; result=result or ((b and 0x1f) shl shift); shift+=5 } while(b>=0x20 && index<encoded.length)
        lat += if((result and 1)!=0) (result shr 1).inv() else result shr 1
        result=0; shift=0
        do { b=encoded[index++].code-63; result=result or ((b and 0x1f) shl shift); shift+=5 } while(b>=0x20 && index<encoded.length)
        lng += if((result and 1)!=0) (result shr 1).inv() else result shr 1
        points.add(LatLng(lat/1e5,lng/1e5))
    }
    return points
}
