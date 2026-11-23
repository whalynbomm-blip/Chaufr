package za.co.chaufr.passenger

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import com.google.android.gms.maps.model.LatLng
import com.google.android.libraries.places.api.Places
import kotlinx.coroutines.launch

private val ChaufrNavy = Color(0xFF101C2C)
private val ChaufrBlue = Color(0xFF2878F0)
private val ChaufrMuted = Color(0xFF8C9AAF)
private val ChaufrBackground = Color(0xFFF4F6FA)
private val ChaufrGreen = Color(0xFF16865B)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (BuildConfig.GOOGLE_MAPS_API_KEY.isNotBlank() && !Places.isInitialized()) {
            Places.initialize(applicationContext, BuildConfig.GOOGLE_MAPS_API_KEY)
        }
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(
                primary = ChaufrBlue,
                background = ChaufrBackground,
                surface = Color.White,
                onSurface = ChaufrNavy,
                onBackground = ChaufrNavy
            )) {
                PassengerHome()
            }
        }
    }
}

private data class FarePreview(
    val total: Double,
    val distanceKm: Double,
    val durationMinutes: Double,
    val baseFare: Double = 10.0,
    val source: String = "DEMO",
    val driverEarnings: Double,
    val commission: Double,
    val distanceCharge: Double,
    val timeCharge: Double,
    val fuelCost: Double,
    val operatingCost: Double
)

@Composable
private fun PassengerHome() {
    var pickup by remember { mutableStateOf("") }
    var destination by remember { mutableStateOf("") }
    var pickupPoint by remember { mutableStateOf<LatLng?>(null) }
    var destinationPoint by remember { mutableStateOf<LatLng?>(null) }
    var vehicle by remember { mutableStateOf("Standard") }
    var preview by remember { mutableStateOf<FarePreview?>(null) }
    var message by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var bookingLoading by remember { mutableStateOf(false) }
    var bookingMessage by remember { mutableStateOf("") }

    Surface(modifier = Modifier.fillMaxSize(), color = ChaufrBackground) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().background(ChaufrNavy).padding(horizontal = 22.dp, vertical = 25.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier.size(42.dp).background(ChaufrBlue, RoundedCornerShape(13.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("C", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Black)
                    }
                    Column(modifier = Modifier.padding(start = 11.dp)) {
                        Text("CHAUFR", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 2.sp)
                        Text("YOUR RIDE. ONE CLEAR PRICE.", color = Color(0xFFB8C7DA), fontSize = 9.sp, letterSpacing = 1.3.sp)
                    }
                    Spacer(Modifier.weight(1f))
                    Text("TEST BUILD", color = Color(0xFF9FC4FF), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(24.dp))
                Text("Start your journey", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Bold)
                Text("Set your route and preview a clear fixed fare.", color = Color(0xFFB8C7DA), fontSize = 13.sp)
            }

            Column(modifier = Modifier.padding(horizontal = 18.dp, vertical = 18.dp)) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    Column(modifier = Modifier.padding(17.dp)) {
                        Text("YOUR JOURNEY", color = ChaufrMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
                        Spacer(Modifier.height(12.dp))
                        GoogleMapsRoutePicker(
                            pickup = pickupPoint,
                            destination = destinationPoint,
                            onPickupSelected = { label, point -> pickup = label; pickupPoint = point; preview = null },
                            onDestinationSelected = { label, point -> destination = label; destinationPoint = point; preview = null }
                        )
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(
                            value = pickup,
                            onValueChange = { pickup = it; pickupPoint = null; preview = null; message = ""; bookingMessage = "" },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Pickup location") },
                            placeholder = { Text("Enter pickup address") },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp)
                        )
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            value = destination,
                            onValueChange = { destination = it; destinationPoint = null; preview = null; message = "" },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Destination") },
                            placeholder = { Text("Where would you like to go?") },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp)
                        )
                        Spacer(Modifier.height(18.dp))
                        Text("CHOOSE YOUR RIDE", color = ChaufrMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
                        Spacer(Modifier.height(9.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("Standard", "Comfort", "XL").forEach { option ->
                                FilterChip(
                                    selected = vehicle == option,
                                    onClick = {
                                if (pickupPoint == null || destinationPoint == null) {
                                    message = "Choose both pickup and destination on the Google map."
                                    preview = null
                                } else if (pickupPoint == destinationPoint) {
                                    message = "Pickup and destination must be different."
                                    preview = null
                                } else if (BuildConfig.CHAUFR_API_BASE_URL.isBlank()) {
                                    message = "The Chaufr server is not connected in this build yet."
                                    preview = null
                                } else if (!loading) {
                                    loading = true
                                    message = ""
                                    scope.launch {
                                        try {
                                            val apiUrl = BuildConfig.CHAUFR_API_BASE_URL
                                            val route = ChaufrApi.computeRoute(apiUrl, pickupPoint!!, destinationPoint!!)
                                            val distanceKm = route.getDouble("distanceKm")
                                            val durationMinutes = route.getDouble("durationMinutes")
                                            val root = ChaufrApi.requestFareQuote(apiUrl, distanceKm, durationMinutes, vehicle.lowercase())
                                            val breakdown = root.getJSONObject("breakdown")
                                            preview = FarePreview(
                                                total = root.getDouble("passengerTotal"),
                                                distanceKm = distanceKm,
                                                durationMinutes = durationMinutes,
                                                baseFare = breakdown.getDouble("baseFare"),
                                                source = "LIVE API",
                                                driverEarnings = breakdown.getDouble("driverEarnings"),
                                                commission = breakdown.getDouble("platformCommission"),
                                                distanceCharge = breakdown.getDouble("distanceCharge"),
                                                timeCharge = breakdown.getDouble("timeCharge"),
                                                fuelCost = breakdown.getDouble("fuelCost"),
                                                operatingCost = breakdown.getDouble("operatingCost")
                                            )
                                        } catch (error: Exception) {
                                            message = error.message ?: "Unable to calculate this route. Please try again."
                                            preview = null
                                        } finally {
                                            loading = false
                                        }
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth().height(52.dp),
                            shape = RoundedCornerShape(13.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = ChaufrBlue)
                        ) {
                            Text(if (loading) "Getting fare..." else "Preview fixed fare", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        }
                        if (message.isNotEmpty()) {
                            Spacer(Modifier.height(9.dp))
                            Text(message, color = Color(0xFFB42318), fontSize = 12.sp)
                        }
                    }
                }

                Spacer(Modifier.height(15.dp))
                preview?.let { fare ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White)
                    ) {
                        Column(modifier = Modifier.padding(18.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("YOUR FARE PREVIEW", color = ChaufrMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                                Spacer(Modifier.weight(1f))
                                Text(fare.source, color = ChaufrGreen, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                            Spacer(Modifier.height(7.dp))
                            Text(money(fare.total), color = ChaufrNavy, fontSize = 34.sp, fontWeight = FontWeight.ExtraBold)
                            Text("$vehicle · ${String.format(Locale("en", "ZA"), "%.1f", fare.distanceKm)} km · ${fare.durationMinutes.toInt()} min", color = ChaufrMuted, fontSize = 12.sp)
                            Spacer(Modifier.height(15.dp))
                            Divider(color = Color(0xFFE8ECF2))
                            Spacer(Modifier.height(12.dp))
                            FareLine("Base fare", fare.baseFare)
                            FareLine("Distance charge", fare.distanceCharge)
                            FareLine("Time charge", fare.timeCharge)
                            FareLine("Fuel estimate", fare.fuelCost)
                            FareLine("Operating cost", fare.operatingCost)
                            FareLine("Driver earnings", fare.driverEarnings, emphasized = true)
                            FareLine("Platform commission", fare.commission)
                            Spacer(Modifier.height(11.dp))
                            Divider(color = Color(0xFFE8ECF2))
                            Spacer(Modifier.height(10.dp))
                            Row {
                                Text("Passenger total", fontWeight = FontWeight.Bold, color = ChaufrNavy)
                                Spacer(Modifier.weight(1f))
                                Text(money(fare.total), fontWeight = FontWeight.ExtraBold, color = ChaufrBlue)
                            }
                            Spacer(Modifier.height(13.dp))
                            Spacer(Modifier.height(14.dp))
                            Button(
                                onClick = {
                                    if (!bookingLoading) scope.launch {
                                        bookingLoading = true
                                        bookingMessage = ""
                                        try {
                                            val token = SecureTokenStore.load(context)
                                                ?: throw IllegalStateException("Sign in to your passenger account before requesting a ride.")
                                            val result = ChaufrApi.requestTrip(
                                                BuildConfig.CHAUFR_API_BASE_URL,
                                                token,
                                                pickup,
                                                destination,
                                                pickupPoint ?: throw IllegalStateException("Choose a pickup point on the map."),
                                                destinationPoint ?: throw IllegalStateException("Choose a destination point on the map."),
                                                vehicle.lowercase()
                                            )
                                            bookingMessage = "Ride request submitted. Automatic driver matching and live notifications are still being connected."
                                        } catch (error: Exception) {
                                            bookingMessage = error.message ?: "Unable to submit your ride request."
                                        } finally {
                                            bookingLoading = false
                                        }
                                    }
                                },
                                enabled = !bookingLoading,
                                modifier = Modifier.fillMaxWidth().height(50.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = ChaufrNavy)
                            ) {
                                Text(if (bookingLoading) "Submitting request..." else "Request this ride", fontWeight = FontWeight.Bold)
                            }
                            if (bookingMessage.isNotBlank()) {
                                Text(bookingMessage, color = if (bookingMessage.startsWith("Ride request submitted")) ChaufrGreen else Color(0xFFB42318), fontSize = 12.sp)
                            }
                            Text(
                                if (fare.source == "LIVE API") "Server-calculated estimate using sample route measurements. Booking and driver matching are not connected yet." else "This is a sample calculation using development rates and an assumed route. It is not a live quote or a booking price.",
                                color = ChaufrMuted, fontSize = 11.sp, lineHeight = 16.sp
                            )
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))
                PassengerAccountCard()
                Spacer(Modifier.height(16.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF1FC))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("COMING IN THE CONNECTED BUILD", color = ChaufrNavy, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(7.dp))
                        Text(
                            "Live map and route distance · server-confirmed fare · passenger account · driver matching · live trip tracking · trip history and receipts.",
                            color = Color(0xFF53647A), fontSize = 12.sp, lineHeight = 18.sp
                        )
                    }
                }
                Spacer(Modifier.height(18.dp))
                Text(
                    "Chaufr · Independent ride-hailing platform",
                    modifier = Modifier.fillMaxWidth(),
                    color = ChaufrMuted,
                    fontSize = 10.sp,
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(12.dp))
            }
        }
    }
}

@Composable
private fun FareLine(label: String, amount: Double, emphasized: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            label,
            color = if (emphasized) ChaufrNavy else ChaufrMuted,
            fontSize = 12.sp,
            fontWeight = if (emphasized) FontWeight.Bold else FontWeight.Normal
        )
        Spacer(Modifier.weight(1f))
        Text(
            money(amount),
            color = ChaufrNavy,
            fontSize = 12.sp,
            fontWeight = if (emphasized) FontWeight.Bold else FontWeight.Medium
        )
    }
}

private fun money(value: Double): String =
    "R " + String.format(Locale("en", "ZA"), "%.2f", value)
