package za.co.chaufr.passenger

import android.app.Activity
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.libraries.places.api.model.Place
import com.google.android.libraries.places.widget.Autocomplete
import com.google.android.libraries.places.widget.model.AutocompleteActivityMode
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import kotlinx.coroutines.launch

@Composable
fun GoogleMapsRoutePicker(
    pickup: LatLng?,
    destination: LatLng?,
    onPickupSelected: (String, LatLng) -> Unit,
    onDestinationSelected: (String, LatLng) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val apiKeyReady = BuildConfig.GOOGLE_MAPS_API_KEY.isNotBlank()
    val capeTown = LatLng(-33.9249, 18.4241)
    val camera = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(capeTown, 11f)
    }

    fun openPlaceSearch(isPickup: Boolean, launcher: (Intent) -> Unit) {
        if (!apiKeyReady) return
        val fields = listOf(Place.Field.ID, Place.Field.NAME, Place.Field.ADDRESS, Place.Field.LAT_LNG)
        launcher(
            Autocomplete.IntentBuilder(AutocompleteActivityMode.OVERLAY, fields)
                .setCountry("ZA")
                .build(context)
        )
    }

    val pickupLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val place = Autocomplete.getPlaceFromIntent(result.data!!)
            val point = place.latLng
            if (point != null) {
                onPickupSelected(place.name ?: place.address ?: "Pickup selected", point)
                scope.launch { camera.animate(CameraUpdateFactory.newLatLngZoom(point, 14f)) }
            }
        }
    }
    val destinationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val place = Autocomplete.getPlaceFromIntent(result.data!!)
            val point = place.latLng
            if (point != null) {
                onDestinationSelected(place.name ?: place.address ?: "Destination selected", point)
                scope.launch { camera.animate(CameraUpdateFactory.newLatLngZoom(point, 12f)) }
            }
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(
            modifier = Modifier.padding(13.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text("MAP & LOCATIONS", color = Color(0xFF101C2C), fontWeight = FontWeight.Bold)
            if (apiKeyReady) {
                GoogleMap(
                    modifier = Modifier.fillMaxWidth().height(220.dp),
                    cameraPositionState = camera
                ) {
                    pickup?.let { Marker(state = MarkerState(it), title = "Pickup") }
                    destination?.let { Marker(state = MarkerState(it), title = "Destination") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        modifier = Modifier.weight(1f),
                        onClick = { openPlaceSearch(true) { pickupLauncher.launch(it) } }
                    ) { Text(if (pickup == null) "Choose pickup" else "Change pickup") }
                    Button(
                        modifier = Modifier.weight(1f),
                        onClick = { openPlaceSearch(false) { destinationLauncher.launch(it) } }
                    ) { Text(if (destination == null) "Choose destination" else "Change destination") }
                }
                Text(
                    "Choose both points using Google Places. Route distance and traffic-based fare calculation are being connected separately.",
                    color = Color(0xFF718096)
                )
            } else {
                Text(
                    "Google Maps is configured in the app. Add your restricted Google Maps Android API key as the Gradle property chaufrGoogleMapsApiKey to enable the map and address search.",
                    color = Color(0xFF718096)
                )
            }
        }
    }
}
