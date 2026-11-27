package za.co.chaufr.passenger

import android.os.Bundle
import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import com.google.android.gms.maps.model.LatLng
import com.google.android.libraries.places.api.Places
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

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

private data class PassengerTripHistoryEntry(
    val tripId: String,
    val status: String,
    val pickup: String,
    val destination: String,
    val farePaid: Double,
    val distanceKm: Double,
    val durationMinutes: Double,
    val requestedAt: String
)

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
    var selectedSection by remember { mutableStateOf("Home") }
    var pickup by remember { mutableStateOf("") }
    var destination by remember { mutableStateOf("") }
    var pickupPoint by remember { mutableStateOf<LatLng?>(null) }
    var destinationPoint by remember { mutableStateOf<LatLng?>(null) }
    var routeQuoteToken by remember { mutableStateOf<String?>(null) }
    var encodedRoute by remember { mutableStateOf<String?>(null) }
    var vehicle by remember { mutableStateOf("Standard") }
    var serviceTier by remember { mutableStateOf("standard") }
    var scheduledLocalDateTime by remember { mutableStateOf("") }
    var recurringWeekdays by remember { mutableStateOf("1,2,3,4,5") }
    var recurringStartDate by remember { mutableStateOf("") }
    var recurringEndDate by remember { mutableStateOf("") }
    var recurringLocalTime by remember { mutableStateOf("08:00") }
    var schedulingMessage by remember { mutableStateOf("") }
    var schedulingBusy by remember { mutableStateOf(false) }
    var scheduleSummary by remember { mutableStateOf("") }
    var scheduledRideRows by remember { mutableStateOf<List<org.json.JSONObject>>(emptyList()) }
    var recurringRideRows by remember { mutableStateOf<List<org.json.JSONObject>>(emptyList()) }
    var scheduleActionBusy by remember { mutableStateOf(false) }
    var preview by remember { mutableStateOf<FarePreview?>(null) }
    var message by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var bookingLoading by remember { mutableStateOf(false) }
    var bookingMessage by remember { mutableStateOf("") }
    var activePassengerTripId by remember { mutableStateOf<String?>(null) }
    var tripStatusSnapshot by remember { mutableStateOf<org.json.JSONObject?>(null) }
    var tripCancellationLoading by remember { mutableStateOf(false) }
    var paymentLoading by remember { mutableStateOf(false) }
    var paymentMessage by remember { mutableStateOf("") }
    var refundLoading by remember { mutableStateOf(false) }
    var refundMessage by remember { mutableStateOf("") }
    var refundReason by remember { mutableStateOf("") }
    var rewardsTickets by remember { mutableStateOf(0) }
    var rewardsHistory by remember { mutableStateOf<List<RewardHistoryEntry>>(emptyList()) }
    var passengerTripHistory by remember { mutableStateOf<List<PassengerTripHistoryEntry>>(emptyList()) }
    var tripHistoryMessage by remember { mutableStateOf("") }
    var redeemReward by remember { mutableStateOf(false) }
    var rewardsMessage by remember { mutableStateOf("") }
    var safetyNotes by remember { mutableStateOf("") }
    var safetyMessage by remember { mutableStateOf("") }
    var safetyBusy by remember { mutableStateOf(false) }

    LaunchedEffect(BuildConfig.CHAUFR_API_BASE_URL) {
        val savedToken = SecureTokenStore.load(context)
        if (!savedToken.isNullOrBlank() && BuildConfig.CHAUFR_API_BASE_URL.isNotBlank()) {
            try {
                val rewards = ChaufrApi.passengerRewards(BuildConfig.CHAUFR_API_BASE_URL, savedToken)
                rewardsTickets = rewards.optInt("tickets", 0)
                rewardsHistory = parseRewardsHistory(rewards)
                val tripHistory = ChaufrApi.passengerTripHistory(BuildConfig.CHAUFR_API_BASE_URL, savedToken)
                passengerTripHistory = parsePassengerTripHistory(tripHistory)
            } catch (_: Exception) { }
        }
    }

    LaunchedEffect(activePassengerTripId) {
        val tripId = activePassengerTripId ?: return@LaunchedEffect
        val token = SecureTokenStore.load(context) ?: return@LaunchedEffect
        val apiBase = BuildConfig.CHAUFR_API_BASE_URL
        if (apiBase.isBlank()) return@LaunchedEffect
        while (true) {
            try {
                val snapshot = ChaufrApi.passengerTripStatus(apiBase, token, tripId)
                tripStatusSnapshot = snapshot
                val status = snapshot.optString("status")
                if (status in listOf("completed", "cancelled", "expired")) {
                    try {
                        val rewards = ChaufrApi.passengerRewards(apiBase, token)
                        rewardsTickets = rewards.optInt("tickets", rewardsTickets)
                        rewardsHistory = parseRewardsHistory(rewards)
                        passengerTripHistory = parsePassengerTripHistory(ChaufrApi.passengerTripHistory(apiBase, token))
                    } catch (_: Exception) { }
                    return@LaunchedEffect
                }
            } catch (_: Exception) {
                // Keep the last successful status visible; retry while this trip is active.
            }
            delay(8_000)
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
        Column(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                if (selectedSection == "Home") {
            Column(
                modifier = Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Color(0xFF101C2C), Color(0xFF1D3B61), Color(0xFF2878F0)))).padding(horizontal = 22.dp, vertical = 27.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier.size(42.dp).background(ChaufrBlue, RoundedCornerShape(20.dp)),
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
                Text("Start your journey", color = Color.White, fontSize = 27.sp, fontWeight = FontWeight.ExtraBold)
                Text("Set your route and preview a clear fixed fare.", color = Color(0xFFB8C7DA), fontSize = 13.sp)
            }

            Column(modifier = Modifier.padding(horizontal = 18.dp, vertical = 18.dp)) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(26.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 5.dp)
                ) {
                    Column(modifier = Modifier.padding(17.dp)) {
                        Text("YOUR JOURNEY", color = ChaufrMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
                        Spacer(Modifier.height(12.dp))
                        GoogleMapsRoutePicker(
                            pickup = pickupPoint,
                            destination = destinationPoint,
                            encodedRoute = encodedRoute,
                            driverLocation = tripStatusSnapshot?.optJSONObject("driver")?.optJSONObject("location")?.let {
                                LatLng(it.optDouble("latitude"), it.optDouble("longitude"))
                            },
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
                            shape = RoundedCornerShape(18.dp)
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
                            Text(if (loading) "Finding your fare..." else "✨  Preview my fare", fontWeight = FontWeight.Bold, fontSize = 15.sp)
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
                            Text("Choose your ride experience", color = ChaufrNavy, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                listOf("saver" to "Saver", "standard" to "Standard", "priority" to "Priority").forEach { (tier, label) ->
                                    FilterChip(
                                        selected = serviceTier == tier,
                                        onClick = { serviceTier = tier },
                                        label = { Text(label, fontSize = 11.sp) }
                                    )
                                }
                            }
                            Text(
                                when (serviceTier) {
                                    "saver" -> "Flexible pickup matching. Same approved fare; no hidden discount or surcharge."
                                    "priority" -> "Prioritises quicker eligible driver matching. Same approved fare."
                                    else -> "Normal Chaufr matching and pickup experience."
                                },
                                color = ChaufrMuted, fontSize = 10.sp
                            )
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
                                                redeemReward,
                                                serviceTier
                                            )
                                            activePassengerTripId = result.optString("tripId").takeIf { it.isNotBlank() }
                                            tripStatusSnapshot = null
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
                            tripStatusSnapshot?.let { snapshot ->
                                Spacer(Modifier.height(12.dp))
                                Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF1FC))) {
                                    Column(modifier = Modifier.padding(13.dp)) {
                                        Text("YOUR RIDE STATUS", color = ChaufrNavy, fontWeight = FontWeight.Bold, fontSize = 11.sp, letterSpacing = 1.sp)
                                        Spacer(Modifier.height(4.dp))
                                        Text(
                                            when (snapshot.optString("status")) {
                                                "requested" -> "Finding a driver for your ride…"
                                                "accepted" -> "Driver accepted your ride"
                                                "driver_arriving" -> "Your driver is on the way"
                                                "in_progress" -> "Your journey is in progress"
                                                "completed" -> "Trip completed"
                                                "cancelled" -> "Trip cancelled"
                                                "expired" -> "Request expired"
                                                else -> snapshot.optString("status").replace("_", " ").capitalize()
                                            },
                                            color = ChaufrBlue, fontWeight = FontWeight.Bold, fontSize = 14.sp
                                        )
                                        if (snapshot.optDouble("passengerPayable", 0.0) > 0.0 &&
                                            snapshot.optString("paymentStatus") !in listOf("paid", "refunded") &&
                                            snapshot.optString("status") !in listOf("cancelled", "expired")) {
                                            Spacer(Modifier.height(10.dp))
                                            if (BuildConfig.PAYMENTS_ENABLED) {
                                                Button(
                                                    onClick = {
                                                        val tripId = activePassengerTripId
                                                        val token = SecureTokenStore.load(context)
                                                        if (tripId != null && token != null && !paymentLoading) scope.launch {
                                                            paymentLoading = true
                                                            paymentMessage = ""
                                                            try {
                                                                val checkout = ChaufrApi.createPaymentCheckout(BuildConfig.CHAUFR_API_BASE_URL, token, tripId)
                                                                val checkoutUrl = checkout.optString("checkoutUrl")
                                                                if (!checkoutUrl.startsWith("https://")) throw IllegalStateException("The secure payment link was not returned.")
                                                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(checkoutUrl)))
                                                                paymentMessage = "Secure card checkout opened. Your trip will update after payment is verified."
                                                            } catch (error: Exception) {
                                                                paymentMessage = error.message ?: "Unable to start payment."
                                                            } finally { paymentLoading = false }
                                                        }
                                                    },
                                                    enabled = !paymentLoading,
                                                    modifier = Modifier.fillMaxWidth(),
                                                    colors = ButtonDefaults.buttonColors(containerColor = ChaufrBlue)
                                                ) { Text(if (paymentLoading) "Opening secure checkout..." else "Pay securely by card") }
                                                if (paymentMessage.isNotBlank()) Text(paymentMessage, color = ChaufrMuted, fontSize = 10.sp)
                                            } else {
                                                Text("Card payments are intentionally disabled in this test build. Payment setup will be completed at the final launch stage.", color = ChaufrMuted, fontSize = 10.sp)
                                            }
                                        } else if (snapshot.optString("paymentStatus") == "paid") {
                                            Text("Payment confirmed", color = ChaufrGreen, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                            if (snapshot.optString("status") == "completed") {
                                                OutlinedTextField(
                                                    value = refundReason,
                                                    onValueChange = { refundReason = it.take(300) },
                                                    modifier = Modifier.fillMaxWidth(),
                                                    label = { Text("Refund reason (optional)") },
                                                    singleLine = true,
                                                    shape = RoundedCornerShape(12.dp)
                                                )
                                                Button(
                                                    onClick = {
                                                        val tripId = activePassengerTripId
                                                        val token = SecureTokenStore.load(context)
                                                        if (tripId != null && token != null && !refundLoading) scope.launch {
                                                            refundLoading = true
                                                            refundMessage = ""
                                                            try {
                                                                val result = ChaufrApi.requestPassengerRefund(
                                                                    BuildConfig.CHAUFR_API_BASE_URL, token, tripId,
                                                                    refundReason.ifBlank { "Passenger requested a completed-trip refund review" }
                                                                )
                                                                refundMessage = "Refund request " + result.optString("status", "submitted") + ". Chaufr will review it."
                                                            } catch (error: Exception) {
                                                                refundMessage = error.message ?: "Unable to request refund."
                                                            } finally { refundLoading = false }
                                                        }
                                                    },
                                                    enabled = !refundLoading,
                                                    modifier = Modifier.fillMaxWidth()
                                                ) { Text(if (refundLoading) "Submitting refund request..." else "Request a refund review") }
                                                if (refundMessage.isNotBlank()) Text(refundMessage, color = ChaufrMuted, fontSize = 10.sp)
                                            }
                                        } else if (snapshot.optString("paymentStatus") == "refunded") {
                                            Text("Payment refunded", color = ChaufrGreen, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                        }
                                        val driver = snapshot.optJSONObject("driver")
                                        if (driver != null) {
                                            Spacer(Modifier.height(6.dp))
                                            Text("Driver: ${driver.optString("name", "Assigned")}", color = ChaufrNavy, fontSize = 12.sp)
                                            val vehicleInfo = driver.optJSONObject("vehicle")
                                            if (vehicleInfo != null) Text(
                                                "${vehicleInfo.optString("make")} ${vehicleInfo.optString("model")} · ${vehicleInfo.optString("category")}",
                                                color = ChaufrMuted, fontSize = 11.sp
                                            )
                                            val location = driver.optJSONObject("location")
                                            if (location != null) Text(
                                                "Driver location updated · ${location.optDouble("latitude")} / ${location.optDouble("longitude")}",
                                                color = ChaufrMuted, fontSize = 10.sp
                                            )
                                        }
                                        Spacer(Modifier.height(10.dp))
                                        PassengerLiveTripMap(snapshot)
                                        if (snapshot.optString("status") == "requested") {
                                            Button(
                                                onClick = {
                                                    val tripId = activePassengerTripId
                                                    val token = SecureTokenStore.load(context)
                                                    if (tripId != null && token != null && !tripCancellationLoading) scope.launch {
                                                        tripCancellationLoading = true
                                                        try {
                                                            val cancelled = ChaufrApi.cancelPassengerTrip(BuildConfig.CHAUFR_API_BASE_URL, token, tripId)
                                                            tripStatusSnapshot = org.json.JSONObject(snapshot.toString()).put("status", cancelled.optString("status", "cancelled"))
                                                            bookingMessage = (if (cancelled.optInt("rewardTicketsReleased", 0) > 0) "Ride cancelled. Your 9 reward tickets have been returned." else "Ride request cancelled.") + if (cancelled.optBoolean("refundRequested")) " Refund request sent for processing." else ""
                                                            refreshRewards(token)
                                                            passengerTripHistory = parsePassengerTripHistory(ChaufrApi.passengerTripHistory(BuildConfig.CHAUFR_API_BASE_URL, token))
                                                        } catch (error: Exception) {
                                                            bookingMessage = error.message ?: "Unable to cancel this request."
                                                        } finally { tripCancellationLoading = false }
                                                    }
                                                },
                                                enabled = !tripCancellationLoading,
                                                modifier = Modifier.fillMaxWidth()
                                            ) { Text(if (tripCancellationLoading) "Cancelling..." else "Cancel request") }
                                        }
                                        snapshot.optJSONObject("driver")?.optString("userId")?.takeIf { it.isNotBlank() }?.let { driverUserId ->
                                            Spacer(Modifier.height(10.dp))
                                            Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF7ED))) {
                                                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    Text("SAFETY SHIELD", color = ChaufrNavy, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                                    Text("Report a concern about this trip or block this driver from future matching.", color = ChaufrMuted, fontSize = 11.sp)
                                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                        Button(onClick = {
                                                            val token = SecureTokenStore.load(context)
                                                            if (token != null) scope.launch {
                                                                safetyBusy = true
                                                                try {
                                                                    val sos = ChaufrApi.triggerSafetySos(BuildConfig.CHAUFR_API_BASE_URL, token, snapshot.optString("tripId"))
                                                                    safetyMessage = "SOS recorded. " + sos.optString("message")
                                                                } catch (error: Exception) { safetyMessage = error.message ?: "SOS could not be sent." }
                                                                finally { safetyBusy = false }
                                                            }
                                                        }, enabled = !safetyBusy, modifier = Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFB42318))) { Text("SOS") }
                                                        Button(onClick = {
                                                            val token = SecureTokenStore.load(context)
                                                            if (token != null) scope.launch {
                                                                try {
                                                                    val share = ChaufrApi.createTripShare(BuildConfig.CHAUFR_API_BASE_URL, token, snapshot.optString("tripId"))
                                                                    safetyMessage = BuildConfig.CHAUFR_API_BASE_URL.trimEnd('/') + "/v1/shared-trips/" + share.optString("shareToken")
                                                                } catch (error: Exception) { safetyMessage = error.message ?: "Could not create trip share." }
                                                            }
                                                        }, modifier = Modifier.weight(1f)) { Text("Share trip") }
                                                    }
                                                    OutlinedTextField(value = safetyNotes, onValueChange = { safetyNotes = it.take(500) }, modifier = Modifier.fillMaxWidth(), label = { Text("Report details (optional)") }, shape = RoundedCornerShape(12.dp), minLines = 2)
                                                    Text("If you are in immediate danger, contact emergency services directly. Chaufr SOS does not call emergency services.", color = ChaufrMuted, fontSize = 10.sp)
                                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                        listOf("Mobile emergency" to "112", "Police" to "10111", "Ambulance" to "10177").forEach { (label, number) ->
                                                            OutlinedButton(onClick = {
                                                                context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + number)))
                                                            }, modifier = Modifier.weight(1f)) { Text("$label\n$number", fontSize = 9.sp) }
                                                        }
                                                    }
                                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                        Button(onClick = {
                                                            val token = SecureTokenStore.load(context)
                                                            if (token == null) safetyMessage = "Sign in to submit a safety report."
                                                            else scope.launch {
                                                                safetyBusy = true
                                                                try {
                                                                    ChaufrApi.reportSafetyParticipant(BuildConfig.CHAUFR_API_BASE_URL, token, snapshot.optString("tripId"), driverUserId, "other", safetyNotes)
                                                                    safetyMessage = "Safety report submitted securely."
                                                                    safetyNotes = ""
                                                                } catch (error: Exception) { safetyMessage = error.message ?: "Unable to submit report." }
                                                                finally { safetyBusy = false }
                                                            }
                                                        }, enabled = !safetyBusy, modifier = Modifier.weight(1f)) { Text("Report driver") }
                                                        Button(onClick = {
                                                            val token = SecureTokenStore.load(context)
                                                            if (token == null) safetyMessage = "Sign in to block a driver."
                                                            else scope.launch {
                                                                safetyBusy = true
                                                                try {
                                                                    ChaufrApi.blockSafetyParticipant(BuildConfig.CHAUFR_API_BASE_URL, token, snapshot.optString("tripId"), driverUserId)
                                                                    safetyMessage = "Driver blocked from future matching."
                                                                } catch (error: Exception) { safetyMessage = error.message ?: "Unable to block driver." }
                                                                finally { safetyBusy = false }
                                                            }
                                                        }, enabled = !safetyBusy, modifier = Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF9F2D20))) { Text("Block driver") }
                                                    }
                                                    if (safetyMessage.isNotBlank()) Text(safetyMessage, color = ChaufrNavy, fontSize = 11.sp)
                                                }
                                            }
                                        }
                                        if (snapshot.optString("status") in listOf("completed", "cancelled", "expired")) {
                                            Button(onClick = { activePassengerTripId = null; tripStatusSnapshot = null }, modifier = Modifier.fillMaxWidth()) { Text("Dismiss trip status") }
                                        }
                                    }
                                }
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
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("MY TRIPS", color = ChaufrNavy, fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = 1.sp)
                                Text("Your recent Chaufr journeys", color = ChaufrMuted, fontSize = 11.sp)
                            }
                            Button(onClick = {
                                val token = SecureTokenStore.load(context)
                                if (token == null) tripHistoryMessage = "Sign in to see your trips."
                                else scope.launch {
                                    try {
                                        passengerTripHistory = parsePassengerTripHistory(ChaufrApi.passengerTripHistory(BuildConfig.CHAUFR_API_BASE_URL, token))
                                        tripHistoryMessage = ""
                                    } catch (error: Exception) { tripHistoryMessage = error.message ?: "Unable to refresh trips" }
                                }
                            }) { Text("Refresh") }
                        }
                        if (tripHistoryMessage.isNotBlank()) Text(tripHistoryMessage, color = ChaufrMuted, fontSize = 11.sp)
                        if (passengerTripHistory.isEmpty()) {
                            Spacer(Modifier.height(8.dp))
                            Text("Your trips will appear here after you book a ride.", color = ChaufrMuted, fontSize = 12.sp)
                        } else {
                            passengerTripHistory.take(8).forEach { trip ->
                                Divider(color = Color(0xFFE8ECF2), modifier = Modifier.padding(vertical = 8.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("${trip.pickup} → ${trip.destination}", color = ChaufrNavy, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 2)
                                        Text("${trip.status.replace("_", " ").uppercase()} · ${trip.distanceKm} km · ${trip.durationMinutes.toInt()} min", color = ChaufrMuted, fontSize = 10.sp)
                                        Text(trip.requestedAt.replace("T", " ").take(16), color = ChaufrMuted, fontSize = 10.sp)
                                    }
                                    Text(if (trip.farePaid == 0.0) "FREE" else money(trip.farePaid), color = ChaufrBlue, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        Text("Plan ahead", color = ChaufrNavy, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                        Text("Use the selected route above to book a future pickup or repeat commute. Choose a route and calculate its fare first. Reward tickets are currently for immediate bookings only.", color = ChaufrMuted, fontSize = 11.sp)
                        OutlinedTextField(
                            value = scheduledLocalDateTime,
                            onValueChange = { scheduledLocalDateTime = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("One-off pickup date and time") },
                            placeholder = { Text("2026-12-01T07:30") },
                            singleLine = true
                        )
                        Button(
                            enabled = !schedulingBusy,
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                scope.launch {
                                    schedulingBusy = true
                                    schedulingMessage = ""
                                    try {
                                        val token = SecureTokenStore.load(context) ?: throw IllegalStateException("Sign in first.")
                                        val routeToken = routeQuoteToken ?: throw IllegalStateException("Choose a route and calculate its fare first.")
                                        val pickupPointValue = pickupPoint ?: throw IllegalStateException("Choose a pickup point.")
                                        val destinationPointValue = destinationPoint ?: throw IllegalStateException("Choose a destination.")
                                        val local = scheduledLocalDateTime.trim()
                                        if (!Regex("^\\d{4}-\\d{2}-\\d{2}T([01]\\d|2[0-3]):[0-5]\\d$").matches(local)) throw IllegalStateException("Use YYYY-MM-DDTHH:MM, South African local time.")
                                        val payload = org.json.JSONObject()
                                            .put("pickupLabel", pickup).put("destinationLabel", destination)
                                            .put("origin", org.json.JSONObject().put("latitude", pickupPointValue.latitude).put("longitude", pickupPointValue.longitude))
                                            .put("destination", org.json.JSONObject().put("latitude", destinationPointValue.latitude).put("longitude", destinationPointValue.longitude))
                                            .put("vehicleCategory", vehicle.lowercase()).put("routeQuoteToken", routeToken)
                                            .put("serviceTier", serviceTier).put("redeemReward", false)
                                            .put("scheduledFor", local + ":00+02:00")
                                        val result = ChaufrApi.createScheduledRide(BuildConfig.CHAUFR_API_BASE_URL, token, payload)
                                        schedulingMessage = "Ride scheduled for " + result.optString("scheduledFor")
                                    } catch (error: Exception) { schedulingMessage = error.message ?: "Could not schedule ride." }
                                    finally { schedulingBusy = false }
                                }
                            }
                        ) { Text("Schedule this ride") }
                        Divider(color = Color(0xFFE8ECF2))
                        Text("Recurring commute", color = ChaufrNavy, fontWeight = FontWeight.SemiBold)
                        OutlinedTextField(value = recurringWeekdays, onValueChange = { recurringWeekdays = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Weekdays (1=Mon … 7=Sun)") }, singleLine = true)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(value = recurringStartDate, onValueChange = { recurringStartDate = it }, modifier = Modifier.weight(1f), label = { Text("Starts YYYY-MM-DD") }, singleLine = true)
                            OutlinedTextField(value = recurringEndDate, onValueChange = { recurringEndDate = it }, modifier = Modifier.weight(1f), label = { Text("Ends YYYY-MM-DD") }, singleLine = true)
                        }
                        OutlinedTextField(value = recurringLocalTime, onValueChange = { recurringLocalTime = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Pickup time (HH:MM)") }, singleLine = true)
                        Button(
                            enabled = !schedulingBusy,
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                scope.launch {
                                    schedulingBusy = true
                                    schedulingMessage = ""
                                    try {
                                        val token = SecureTokenStore.load(context) ?: throw IllegalStateException("Sign in first.")
                                        val routeToken = routeQuoteToken ?: throw IllegalStateException("Choose a route and calculate its fare first.")
                                        val pickupPointValue = pickupPoint ?: throw IllegalStateException("Choose a pickup point.")
                                        val destinationPointValue = destinationPoint ?: throw IllegalStateException("Choose a destination.")
                                        val days = recurringWeekdays.split(",").map { it.trim().toInt() }
                                        val payload = org.json.JSONObject()
                                            .put("pickupLabel", pickup).put("destinationLabel", destination)
                                            .put("origin", org.json.JSONObject().put("latitude", pickupPointValue.latitude).put("longitude", pickupPointValue.longitude))
                                            .put("destination", org.json.JSONObject().put("latitude", destinationPointValue.latitude).put("longitude", destinationPointValue.longitude))
                                            .put("vehicleCategory", vehicle.lowercase()).put("routeQuoteToken", routeToken)
                                            .put("serviceTier", serviceTier).put("redeemReward", false)
                                            .put("weekdays", org.json.JSONArray(days)).put("startsOn", recurringStartDate)
                                            .put("endsOn", recurringEndDate).put("localTime", recurringLocalTime)
                                        val result = ChaufrApi.createRecurringRide(BuildConfig.CHAUFR_API_BASE_URL, token, payload)
                                        schedulingMessage = "Recurring commute saved. Chaufr will create the ride requests on your selected days."
                                    } catch (error: Exception) { schedulingMessage = error.message ?: "Could not save recurring commute." }
                                    finally { schedulingBusy = false }
                                }
                            }
                        ) { Text("Save recurring commute") }
                        if (schedulingMessage.isNotBlank()) Text(schedulingMessage, color = ChaufrGreen, fontSize = 11.sp)
                        Button(
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !scheduleActionBusy,
                            onClick = {
                                scope.launch {
                                    scheduleActionBusy = true
                                    try {
                                        val token = SecureTokenStore.load(context) ?: throw IllegalStateException("Sign in first.")
                                        val result = ChaufrApi.passengerScheduledRides(BuildConfig.CHAUFR_API_BASE_URL, token)
                                        val scheduled = result.optJSONArray("scheduled")
                                        val recurring = result.optJSONArray("recurring")
                                        scheduledRideRows = (0 until (scheduled?.length() ?: 0)).mapNotNull { scheduled?.optJSONObject(it) }
                                        recurringRideRows = (0 until (recurring?.length() ?: 0)).mapNotNull { recurring?.optJSONObject(it) }
                                        scheduleSummary = ""
                                    } catch (error: Exception) { scheduleSummary = error.message ?: "Unable to load bookings." }
                                    finally { scheduleActionBusy = false }
                                }
                            }
                        ) { Text(if (scheduleActionBusy) "Loading…" else "View and manage my scheduled rides") }
                        if (scheduleSummary.isNotBlank()) Text(scheduleSummary, color = ChaufrMuted, fontSize = 10.sp, lineHeight = 15.sp)
                        scheduledRideRows.filter { it.optString("status") in listOf("scheduled", "dispatching") }.forEach { row ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(row.optString("pickup_label") + " → " + row.optString("destination_label"), color = ChaufrNavy, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                    Text(row.optString("scheduled_for").replace("T", " ").take(16) + " · " + row.optString("status"), color = ChaufrMuted, fontSize = 10.sp)
                                }
                                Button(enabled = !scheduleActionBusy && row.optString("status") == "scheduled", onClick = {
                                    scope.launch {
                                        scheduleActionBusy = true
                                        try {
                                            val token = SecureTokenStore.load(context) ?: throw IllegalStateException("Sign in first.")
                                            ChaufrApi.cancelScheduledRide(BuildConfig.CHAUFR_API_BASE_URL, token, row.optString("id"))
                                            scheduledRideRows = scheduledRideRows.filterNot { it.optString("id") == row.optString("id") }
                                            scheduleSummary = "Scheduled ride cancelled."
                                        } catch (error: Exception) { scheduleSummary = error.message ?: "Unable to cancel scheduled ride." }
                                        finally { scheduleActionBusy = false }
                                    }
                                }) { Text("Cancel") }
                            }
                            Divider(color = Color(0xFFE8ECF2))
                        }
                        recurringRideRows.filter { it.optString("status") == "active" }.forEach { row ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(row.optString("pickup_label") + " → " + row.optString("destination_label"), color = ChaufrNavy, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                    Text("Repeat " + row.optString("weekdays") + " at " + row.optString("local_time") + " · " + row.optString("starts_on") + " to " + row.optString("ends_on"), color = ChaufrMuted, fontSize = 10.sp)
                                }
                                Button(enabled = !scheduleActionBusy, onClick = {
                                    scope.launch {
                                        scheduleActionBusy = true
                                        try {
                                            val token = SecureTokenStore.load(context) ?: throw IllegalStateException("Sign in first.")
                                            ChaufrApi.cancelRecurringRide(BuildConfig.CHAUFR_API_BASE_URL, token, row.optString("id"))
                                            recurringRideRows = recurringRideRows.filterNot { it.optString("id") == row.optString("id") }
                                            scheduleSummary = "Recurring commute cancelled. Future generated rides were stopped."
                                        } catch (error: Exception) { scheduleSummary = error.message ?: "Unable to cancel recurring commute." }
                                        finally { scheduleActionBusy = false }
                                    }
                                }) { Text("Stop") }
                            }
                            Divider(color = Color(0xFFE8ECF2))
                        }
                        if (scheduledRideRows.isEmpty() && recurringRideRows.isEmpty() && scheduleSummary.isBlank()) {
                            Text("No upcoming bookings or recurring commutes.", color = ChaufrMuted, fontSize = 10.sp)
                        }
                        Divider(color = Color(0xFFE8ECF2))
                        PassengerTrustedContactsPanel()
                    }
                }
                Spacer(Modifier.height(14.dp))
                PassengerFeedbackSupportPanel()
                Spacer(Modifier.height(14.dp))
                PassengerAccountCard(onSignedIn = { refreshRewards(it); scope.launch {
                    try { passengerTripHistory = parsePassengerTripHistory(ChaufrApi.passengerTripHistory(BuildConfig.CHAUFR_API_BASE_URL, it)) } catch (_: Exception) { }
                } })
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
                } else {
                    Column(modifier = Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text("CHAUFR", color = ChaufrBlue, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 2.sp)
                        Text(selectedSection, color = ChaufrNavy, fontSize = 25.sp, fontWeight = FontWeight.ExtraBold)
                        when (selectedSection) {
                            "My Trips" -> {
                                Text("Your active and previous journeys", color = ChaufrMuted, fontSize = 12.sp)
                                if (activePassengerTripId != null) {
                                    Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Text("ACTIVE JOURNEY", color = ChaufrBlue, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                            Text("Trip status: " + (tripStatusSnapshot?.optString("status") ?: "Loading"), color = ChaufrNavy, fontWeight = FontWeight.Bold)
                                            Text("Trip reference: " + activePassengerTripId!!.take(8), color = ChaufrMuted, fontSize = 11.sp)
                                        }
                                    }
                                    tripStatusSnapshot?.let { PassengerLiveTripMap(it) }
                                }
                                passengerTripHistory.forEach { trip ->
                                    Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                            Text(trip.pickup + " → " + trip.destination, color = ChaufrNavy, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                            Text(trip.status.uppercase() + " · " + money(trip.farePaid), color = ChaufrMuted, fontSize = 11.sp)
                                            Text(trip.requestedAt.replace("T", " ").take(16), color = ChaufrMuted, fontSize = 10.sp)
                                        }
                                    }
                                }
                                if (passengerTripHistory.isEmpty()) Text("Your trips will appear here after your first booking.", color = ChaufrMuted)
                                OutlinedButton(onClick = { selectedSection = "Home" }) { Text("Book a ride") }
                            }
                            "Rewards" -> {
                                Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                                    Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text("YOUR REWARD BALANCE", color = ChaufrMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                        Text("$rewardsTickets / 9 tickets", color = ChaufrNavy, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
                                        Text("\${(rewardsTickets.coerceAtMost(9) * 100) / 9}% towards your next eligible free short ride", color = ChaufrMuted, fontSize = 11.sp)
                                        Button(onClick = { refreshRewards(SecureTokenStore.load(context) ?: "") }, enabled = BuildConfig.CHAUFR_API_BASE_URL.isNotBlank()) { Text("Refresh rewards") }
                                    }
                                }
                                rewardsHistory.forEach { item ->
                                    Text(item.type.replace("_", " ") + " · " + (if (item.ticketsDelta >= 0) "+" else "") + item.ticketsDelta + " tickets · " + item.date, color = ChaufrNavy, fontSize = 12.sp)
                                }
                                if (rewardsMessage.isNotBlank()) Text(rewardsMessage, color = ChaufrMuted, fontSize = 11.sp)
                            }
                            "Safety" -> {
                                Text("Your safety tools and trusted contacts", color = ChaufrMuted, fontSize = 12.sp)
                                PassengerTrustedContactsPanel()
                                Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text("EMERGENCY NUMBERS", color = ChaufrBlue, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                        listOf("112" to "Mobile emergency", "10111" to "Police", "10177" to "Ambulance").forEach { item ->
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Text(item.first, color = ChaufrNavy, fontWeight = FontWeight.Bold)
                                                Spacer(Modifier.weight(1f))
                                                Text(item.second, color = ChaufrMuted, fontSize = 11.sp)
                                            }
                                        }
                                        Text("Chaufr does not dispatch emergency services. Contact emergency services directly using your phone.", color = ChaufrMuted, fontSize = 10.sp)
                                    }
                                }
                            }
                            else -> {
                                PassengerAccountCard()
                                PassengerFeedbackSupportPanel()
                                Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                                    Column(Modifier.padding(16.dp)) {
                                        Text("WALLET & PAYMENTS", color = ChaufrBlue, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                        Text(if (BuildConfig.PAYMENTS_ENABLED) "Payment features are being prepared." else "Card payments and wallet controls will appear after the final payment-provider integration.", color = ChaufrMuted, fontSize = 11.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }
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

private fun parsePassengerTripHistory(response: org.json.JSONObject): List<PassengerTripHistoryEntry> {
    val trips = response.optJSONArray("trips") ?: return emptyList()
    return (0 until trips.length()).mapNotNull { index ->
        val item = trips.optJSONObject(index) ?: return@mapNotNull null
        PassengerTripHistoryEntry(
            tripId = item.optString("tripId"),
            status = item.optString("status", "unknown"),
            pickup = item.optString("pickupLabel", "Pickup"),
            destination = item.optString("destinationLabel", "Destination"),
            farePaid = item.optDouble("passengerPayable", item.optDouble("quotedFare", 0.0)),
            distanceKm = item.optDouble("distanceKm", 0.0),
            durationMinutes = item.optDouble("durationMinutes", 0.0),
            requestedAt = item.optString("requestedAt", "")
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
