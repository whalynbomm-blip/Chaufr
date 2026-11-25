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
import androidx.compose.runtime.LaunchedEffect
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

private data class RewardHistoryEntry(
    val type: String,
    val ticketsDelta: Int,
    val date: String,
    val pickup: String,
    val destination: String
)

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
    var routeQuoteToken by remember { mutableStateOf<String?>(null) }
    var encodedRoute by remember { mutableStateOf<String?>(null) }
    var vehicle by remember { mutableStateOf("Standard") }
    var preview by remember { mutableStateOf<FarePreview?>(null) }
    var message by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var bookingLoading by remember { mutableStateOf(false) }
    var bookingMessage by remember { mutableStateOf("") }
    var rewardsTickets by remember { mutableStateOf(0) }
    var rewardsHistory by remember { mutableStateOf<List<RewardHistoryEntry>>(emptyList()) }
    var redeemReward by remember { mutableStateOf(false) }
    var rewardsMessage by remember { mutableStateOf("") }

    LaunchedEffect(BuildConfig.CHAUFR_API_BASE_URL) {
        val savedToken = SecureTokenStore.load(context)
        if (!savedToken.isNullOrBlank() && BuildConfig.CHAUFR_API_BASE_URL.isNotBlank()) {
            try {
                val rewards = ChaufrApi.passengerRewards(BuildConfig.CHAUFR_API_BASE_URL, savedToken)
                rewardsTickets = rewards.optInt("tickets", 0)
                rewardsHistory = parseRewardsHistory(rewards)
            } catch (_: Exception) { }
        }
    }

    fun refreshRewards(token: String) {
        if (BuildConfig.CHAUFR_API_BASE_URL.isBlank()) return
        scope.launch {
            try {
                val rewards = ChaufrApi.passengerRewards(BuildConfig.CHAUFR_API_BASE_URL, token)
                rewardsTickets = rewards.optInt("tickets", 0)
                rewardsHistory = parseRewardsHistory(rewards)
                rewardsMessage = ""
            } catch (error: Exception) { rewardsMessage = error.message ?: "Unable to refresh reward tickets." }
        }
    }
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
                            encodedRoute = encodedRoute,
                            onPickupSelected = { label, point -> pickup = label; pickupPoint = point; preview = null; routeQuoteToken = null; encodedRoute = null; redeemReward = false; bookingMessage = "" },
                            onDestinationSelected = { label, point -> destination = label; destinationPoint = point; preview = null; routeQuoteToken = null; encodedRoute = null; bookingMessage = "" }
                        )
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(
                            value = pickup,
                            onValueChange = { pickup = it; pickupPoint = null; routeQuoteToken = null; encodedRoute = null; redeemReward = false; preview = null; message = ""; bookingMessage = "" },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Pickup location") },
                            placeholder = { Text("Enter pickup address") },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp)
                        )
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            value = destination,
                            onValueChange = { destination = it; destinationPoint = null; routeQuoteToken = null; encodedRoute = null; redeemReward = false; preview = null; message = ""; bookingMessage = "" },
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
                                        vehicle = option
                                        preview = null
                                        routeQuoteToken = null
                                        encodedRoute = null
                                        bookingMessage = ""
                                    },
                                    label = { Text(option) }
                                )
                            }
                        }
                        Spacer(Modifier.height(16.dp))
                        Button(
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
                                            val route = ChaufrApi.computeRoute(apiUrl, pickupPoint!!, destinationPoint!!, vehicle.lowercase())
                                            routeQuoteToken = route.getString("quoteToken")
                                            encodedRoute = route.optString("encodedPolyline").takeIf { it.isNotBlank() }
                                            val distanceKm = route.getDouble("distanceKm")
                                            val durationMinutes = route.getDouble("durationMinutes")
                                            val breakdown = route.getJSONObject("breakdown")
                                            preview = FarePreview(
                                                total = route.getDouble("passengerTotal"),
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
                                            routeQuoteToken = null
                                            encodedRoute = null
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
                            Text(money(if (redeemReward) 0.0 else fare.total), color = ChaufrNavy, fontSize = 34.sp, fontWeight = FontWeight.ExtraBold)
                            Text("$vehicle · ${String.format(Locale("en", "ZA"), "%.1f", fare.distanceKm)} km · ${fare.durationMinutes.toInt()} min", color = ChaufrMuted, fontSize = 12.sp)
                            if (fare.durationMinutes in 5.0..20.0 && rewardsTickets >= 9) {
                                Spacer(Modifier.height(10.dp))
                                FilterChip(
                                    selected = redeemReward,
                                    onClick = { redeemReward = !redeemReward },
                                    label = { Text(if (redeemReward) "9 tickets applied · free ride" else "Use 9 tickets for a free ride") }
                                )
                            } else if (fare.durationMinutes in 5.0..20.0) {
                                Text("Chaufr Rewards: $rewardsTickets / 9 tickets · ${9 - rewardsTickets} more for a free ride", color = ChaufrGreen, fontSize = 11.sp)
                            }
                            Spacer(Modifier.height(15.dp))
                            Divider(color = Color(0xFFE8ECF2))
                            Spacer(Modifier.height(12.dp))
                            FareLine("Base fare", fare.baseFare)
                            FareLine("Distance charge", fare.distanceCharge)
                            FareLine("Time charge", fare.timeCharge)
                            FareLine("Fuel estimate", fare.fuelCost)
                            FareLine("Operating cost", fare.operatingCost)
                                                        Spacer(Modifier.height(11.dp))
                            Divider(color = Color(0xFFE8ECF2))
                            Spacer(Modifier.height(10.dp))
                            Row {
                                Text("Passenger total", fontWeight = FontWeight.Bold, color = ChaufrNavy)
                                Spacer(Modifier.weight(1f))
                                Text(money(if (redeemReward) 0.0 else fare.total), fontWeight = FontWeight.ExtraBold, color = ChaufrBlue)
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
                                                vehicle.lowercase(),
                                                routeQuoteToken ?: throw IllegalStateException("Calculate the fare again before requesting this ride."),
                                                redeemReward
                                            )
                                            if (redeemReward) rewardsTickets = (rewardsTickets - 9).coerceAtLeast(0)
                                            bookingMessage = if (redeemReward) "Free ride reward applied. 9 tickets reserved; your driver still receives normal earnings." else "Ride request submitted. You earn 1 reward ticket after the trip is completed."
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
                                "Server-calculated fare using a traffic-aware Google driving route. This price is locked when your ride request is submitted.",
                                color = ChaufrMuted, fontSize = 11.sp, lineHeight = 16.sp
                            )
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White)
                ) {
                    Column(modifier = Modifier.padding(17.dp)) {
                        Text("CHAUFR REWARDS", color = ChaufrNavy, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(5.dp))
                        Text("$rewardsTickets / 9 tickets", color = ChaufrBlue, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
                        Text("Earn 1 ticket for every completed trip. Redeem 9 tickets for a free ride between 5 and 20 minutes.", color = ChaufrMuted, fontSize = 12.sp, lineHeight = 17.sp)
                        Spacer(Modifier.height(9.dp))
                        Button(onClick = {
                            val savedToken = SecureTokenStore.load(context)
                            if (savedToken == null) rewardsMessage = "Sign in to your passenger account to view your tickets."
                            else refreshRewards(savedToken)
                        }, modifier = Modifier.fillMaxWidth()) { Text("Refresh my tickets") }
                        if (rewardsMessage.isNotBlank()) Text(rewardsMessage, color = ChaufrMuted, fontSize = 11.sp)
                        if (rewardsHistory.isNotEmpty()) {
                            Spacer(Modifier.height(14.dp))
                            Divider(color = Color(0xFFE8ECF2))
                            Spacer(Modifier.height(10.dp))
                            Text("TICKET HISTORY", color = ChaufrNavy, fontWeight = FontWeight.Bold, fontSize = 11.sp, letterSpacing = 1.sp)
                            Spacer(Modifier.height(6.dp))
                            rewardsHistory.forEach { entry ->
                                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            when (entry.type) {
                                                "earned" -> "Trip completed · ticket earned"
                                                "redeemed" -> "Free ride reward redeemed"
                                                "released" -> "Tickets returned"
                                                else -> "Rewards update"
                                            },
                                            color = ChaufrNavy, fontWeight = FontWeight.Medium, fontSize = 12.sp
                                        )
                                        Text("${entry.pickup} → ${entry.destination}", color = ChaufrMuted, fontSize = 10.sp, maxLines = 1)
                                        Text(entry.date, color = ChaufrMuted, fontSize = 10.sp)
                                    }
                                    Text(
                                        if (entry.ticketsDelta > 0) "+${entry.ticketsDelta}" else entry.ticketsDelta.toString(),
                                        color = if (entry.ticketsDelta > 0) ChaufrGreen else Color(0xFFB42318),
                                        fontWeight = FontWeight.Bold, fontSize = 14.sp
                                    )
                                }
                            }
                        } else {
                            Spacer(Modifier.height(8.dp))
                            Text("Your ticket activity will appear here after your first completed trip.", color = ChaufrMuted, fontSize = 11.sp)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                PassengerAccountCard(onSignedIn = { refreshRewards(it) })
                Spacer(Modifier.height(16.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF1FC))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("CHAUFR PASSENGER", color = ChaufrNavy, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(7.dp))
                        Text(
                            "Google Maps · address search · traffic-aware route estimates · fixed server-calculated fares · passenger account · ride requests.",
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

private fun parseRewardsHistory(rewards: org.json.JSONObject): List<RewardHistoryEntry> {
    val history = rewards.optJSONArray("history") ?: return emptyList()
    return (0 until history.length()).mapNotNull { index ->
        val item = history.optJSONObject(index) ?: return@mapNotNull null
        RewardHistoryEntry(
            type = item.optString("type", "unknown"),
            ticketsDelta = item.optInt("ticketsDelta", 0),
            date = item.optString("createdAt", "").replace("T", " ").take(16),
            pickup = item.optString("pickupLabel", "Trip"),
            destination = item.optString("destinationLabel", "Trip")
        )
    }
}

private fun money(value: Double): String =
    "R " + String.format(Locale("en", "ZA"), "%.2f", value)
