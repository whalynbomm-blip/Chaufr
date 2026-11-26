package za.co.chaufr.driver

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Bundle
import android.net.Uri
import android.util.Base64
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.compose.runtime.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.util.Locale
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Navy = Color(0xFF101C2C)
private val Blue = Color(0xFF2878F0)
private val Muted = Color(0xFF8291A5)
private val Page = Color(0xFFF3F6FA)
private val Green = Color(0xFF16865B)

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      MaterialTheme(colorScheme = darkColorScheme(
        primary = Blue,
        background = Page,
        surface = Color.White,
        onSurface = Navy,
        onBackground = Navy
      )) { DriverHome() }
    }
  }
}

@Composable
private fun DriverHome() {
  Surface(modifier = Modifier.fillMaxSize(), color = Page) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
      Column(
        modifier = Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Color(0xFF101C2C), Color(0xFF1D3B61), Color(0xFF2878F0)))).padding(horizontal = 22.dp, vertical = 27.dp)
      ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Column {
            Text("CHAUFR", color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 2.sp)
            Text("DRIVER PARTNER", color = Color(0xFFB8C7DA), fontSize = 10.sp, letterSpacing = 1.5.sp)
          }
          Spacer(Modifier.weight(1f))
          Text("TEST BUILD", color = Color(0xFF9FC4FF), fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(24.dp))
        Text("Ready to roll?", color = Color.White, fontSize = 27.sp, fontWeight = FontWeight.ExtraBold)
        Text("Your next great trip starts here.", color = Color(0xFFB8C7DA), fontSize = 13.sp)
      }

      Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        DriverAccountCard()
        DriverComplianceCard()
        DriverAdvantageSettingsCard()
        DriverAvailabilityCard()
        AvailableTripsCard()
        DriverCurrentTripCard()

        Text("TODAY'S SUMMARY", color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          SummaryCard("EARNINGS", "R 0.00", Modifier.weight(1f))
          SummaryCard("TRIPS", "0", Modifier.weight(1f))
        }

        Card(
          modifier = Modifier.fillMaxWidth(),
          shape = RoundedCornerShape(26.dp),
          colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
          Column(modifier = Modifier.padding(17.dp)) {
            Text("YOUR VEHICLE", color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
            Spacer(Modifier.height(8.dp))
            Text("Vehicle onboarding", color = Navy, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Text("Submit your vehicle and driver licence details in the Driver Account section above. Chaufr will require approval before you can go online.", color = Muted, fontSize = 12.sp, lineHeight = 18.sp)
            Spacer(Modifier.height(12.dp))
            Text("DRIVER VERIFICATION", color = Blue, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text("Check your verification status in the Driver Account section.", color = Navy, fontSize = 12.sp)
          }
        }

        Card(
          modifier = Modifier.fillMaxWidth(),
          shape = RoundedCornerShape(18.dp),
          colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF1FC))
        ) {
          Column(modifier = Modifier.padding(17.dp)) {
            Text("TRIP REQUESTS", color = Navy, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            Text("No live trip offers yet. Passenger requests, driver matching, navigation and trip status updates will be enabled when the shared backend is connected.", color = Color(0xFF53647A), fontSize = 12.sp, lineHeight = 18.sp)
          }
        }

        Text(
          "Chaufr Driver · Development preview. Earnings and availability shown here are not live account data.",
          modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
          color = Muted,
          fontSize = 10.sp,
          lineHeight = 15.sp
        )
      }
    }
  }
}

@Composable
private fun DriverComplianceCard() {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val apiUrl = BuildConfig.CHAUFR_API_BASE_URL
  var accountNumber by remember { mutableStateOf("") }
  var bankCode by remember { mutableStateOf("") }
  var bankName by remember { mutableStateOf("") }
  var accountMessage by remember { mutableStateOf("Add a bank account to receive completed-trip and reward-ride payouts.") }
  var documentMessage by remember { mutableStateOf("") }
  var documentSummary by remember { mutableStateOf("Identity and driver's licence documents are required before verification.") }
  var busy by remember { mutableStateOf(false) }

  suspend fun refreshDocuments(token: String) {
    val response = ChaufrApi.verificationDocuments(apiUrl, token)
    val docs = response.optJSONArray("documents")
    if (docs != null && docs.length() > 0) {
      documentSummary = (0 until docs.length()).joinToString(" · ") { index ->
        val doc = docs.getJSONObject(index)
        doc.optString("documentType").replace("_", " ") + ": " + doc.optString("status")
      }
    }
  }

  LaunchedEffect(apiUrl) {
    val token = SecureTokenStore.load(context)
    if (!token.isNullOrBlank() && apiUrl.isNotBlank()) {
      try { refreshDocuments(token) } catch (_: Exception) { }
    }
  }

  fun uploadDocument(uri: Uri?, documentType: String) {
    if (uri == null) return
    val token = SecureTokenStore.load(context)
    if (token.isNullOrBlank() || apiUrl.isBlank()) {
      documentMessage = "Sign in and connect the Chaufr server before uploading."
      return
    }
    scope.launch {
      busy = true
      documentMessage = ""
      try {
        val mime = context.contentResolver.getType(uri) ?: throw IllegalStateException("Unsupported file type.")
        if (mime !in listOf("image/jpeg", "image/png", "application/pdf")) throw IllegalStateException("Choose a JPG, PNG or PDF document.")
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
          ?: throw IllegalStateException("Unable to read the selected document.")
        if (bytes.isEmpty() || bytes.size > 6 * 1024 * 1024) throw IllegalStateException("Document must be smaller than 6 MB.")
        val encoded = Base64.encodeToString(bytes, Base64.NO_WRAP)
        val result = ChaufrApi.uploadVerificationDocument(apiUrl, token, documentType, uri.lastPathSegment ?: "verification-document", mime, encoded)
        documentMessage = "Document uploaded. Status: " + result.getJSONObject("document").optString("status")
        refreshDocuments(token)
      } catch (error: Exception) {
        documentMessage = error.message ?: "Document upload failed."
      } finally { busy = false }
    }
  }

  val idPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
    uploadDocument(uri, "south_african_id")
  }
  val licencePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
    uploadDocument(uri, "drivers_licence")
  }

  Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp),
    colors = CardDefaults.cardColors(containerColor = Color.White)) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
      Text("PAYOUTS & VERIFICATION", color = Blue, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
      Text("Bank account for payouts", color = Navy, fontSize = 16.sp, fontWeight = FontWeight.Bold)
      OutlinedTextField(value = accountNumber, onValueChange = { accountNumber = it.filter(Char::isDigit).take(20) },
        modifier = Modifier.fillMaxWidth(), label = { Text("Bank account number") }, singleLine = true)
      OutlinedTextField(value = bankCode, onValueChange = { bankCode = it.filter(Char::isDigit).take(12) },
        modifier = Modifier.fillMaxWidth(), label = { Text("Bank code") }, singleLine = true)
      OutlinedTextField(value = bankName, onValueChange = { bankName = it.take(100) },
        modifier = Modifier.fillMaxWidth(), label = { Text("Bank name") }, singleLine = true)
      Button(onClick = {
        val token = SecureTokenStore.load(context)
        if (token.isNullOrBlank()) accountMessage = "Sign in to save your payout account."
        else scope.launch {
          busy = true
          try {
            val result = ChaufrApi.setPayoutAccount(apiUrl, token, accountNumber, bankCode, bankName)
            accountMessage = "Bank account verified for ${result.optString("accountName")}."
            accountNumber = ""
          } catch (error: Exception) { accountMessage = error.message ?: "Could not verify bank account." }
          finally { busy = false }
        }
      }, enabled = !busy && accountNumber.length >= 6 && bankCode.isNotBlank() && bankName.isNotBlank(),
        modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Please wait..." else "Verify and save bank account") }
      Text(accountMessage, color = Muted, fontSize = 10.sp)
      Spacer(Modifier.height(4.dp))
      Text("Driver identity documents", color = Navy, fontSize = 15.sp, fontWeight = FontWeight.Bold)
      Text("Upload a clear photo or PDF of your South African ID and driver's licence. Files are encrypted before storage.", color = Muted, fontSize = 11.sp)
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { idPicker.launch("*/*") }, enabled = !busy, modifier = Modifier.weight(1f)) { Text("Upload ID") }
        OutlinedButton(onClick = { licencePicker.launch("*/*") }, enabled = !busy, modifier = Modifier.weight(1f)) { Text("Upload licence") }
      }
      Text(documentSummary, color = Muted, fontSize = 10.sp)
      if (documentMessage.isNotBlank()) Text(documentMessage, color = if (documentMessage.startsWith("Document uploaded")) Green else Color(0xFFB42318), fontSize = 10.sp)
    }
  }
}

@Composable
private fun DriverAdvantageSettingsCard() {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val apiUrl = BuildConfig.CHAUFR_API_BASE_URL
  var areas by remember { mutableStateOf("") }
  var minNet by remember { mutableStateOf("0") }
  var maxPickup by remember { mutableStateOf("15") }
  var fuelPrice by remember { mutableStateOf("0") }
  var operatingCost by remember { mutableStateOf("0") }
  var loading by remember { mutableStateOf(false) }
  var message by remember { mutableStateOf("Preferences are used by Chaufr FairMatch.") }

  LaunchedEffect(apiUrl) {
    val token = SecureTokenStore.load(context)
    if (!token.isNullOrBlank() && apiUrl.isNotBlank()) {
      loading = true
      try {
        val data = ChaufrApi.driverAdvantageSettings(apiUrl, token)
        areas = data.optJSONArray("preferredAreaLabels")?.let { array ->
          (0 until array.length()).map { array.optString(it) }.joinToString(", ")
        } ?: ""
        minNet = data.optDouble("minimumNetPerTrip", 0.0).toString()
        maxPickup = data.optDouble("maximumPickupDistanceKm", 15.0).toString()
        fuelPrice = data.optDouble("fuelPricePerLitre", 0.0).toString()
        operatingCost = data.optDouble("operatingCostPerKm", 0.0).toString()
        message = "Settings loaded."
      } catch (_: Exception) {
        message = "Connect to Chaufr to load your settings."
      } finally { loading = false }
    }
  }

  Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp),
    colors = CardDefaults.cardColors(containerColor = Color.White)) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Text("CHA UFR ADVANTAGE".replace(" ",""), color = Blue, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
      Text("Trip preferences & profit settings", color = Navy, fontSize = 16.sp, fontWeight = FontWeight.Bold)
      Text("Set your own pickup limit and minimum estimated net. Costs are estimates and will help FairMatch rank offers.", color = Muted, fontSize = 12.sp, lineHeight = 17.sp)
      OutlinedTextField(areas, { areas = it }, label = { Text("Preferred areas (comma-separated)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
      OutlinedTextField(minNet, { minNet = it }, label = { Text("Minimum net per trip (R)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
      OutlinedTextField(maxPickup, { maxPickup = it }, label = { Text("Maximum pickup distance (km)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
      OutlinedTextField(fuelPrice, { fuelPrice = it }, label = { Text("Fuel price per litre (R)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
      OutlinedTextField(operatingCost, { operatingCost = it }, label = { Text("Other vehicle cost per km (R)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
      Button(onClick = {
        scope.launch {
          val token = SecureTokenStore.load(context)
          if (token.isNullOrBlank() || apiUrl.isBlank()) { message = "Sign in and connect to the API to save settings."; return@launch }
          val payload = try {
            JSONObject()
              .put("preferredAreaLabels", areas.split(",").map { it.trim() }.filter { it.isNotBlank() }.distinct())
              .put("minimumNetPerTrip", minNet.toDouble())
              .put("maximumPickupDistanceKm", maxPickup.toDouble())
              .put("fuelPricePerLitre", fuelPrice.toDouble())
              .put("operatingCostPerKm", operatingCost.toDouble())
          } catch (_: Exception) { message = "Please enter valid numeric values."; return@launch }
          loading = true
          try {
            ChaufrApi.updateDriverAdvantageSettings(apiUrl, token, payload)
            message = "Saved. FairMatch will apply your minimum net and pickup limits."
          } catch (e: Exception) { message = e.message ?: "Could not save settings." }
          finally { loading = false }
        }
      }, enabled = !loading, modifier = Modifier.fillMaxWidth()) {
        Text(if (loading) "Loading / saving…" else "Save Advantage settings")
      }
      Text(message, color = Muted, fontSize = 11.sp, lineHeight = 16.sp)
    }
  }
}

@Composable
private fun DriverAvailabilityCard() {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val apiUrl = BuildConfig.CHAUFR_API_BASE_URL
  val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
  var available by remember { mutableStateOf(false) }
  var busy by remember { mutableStateOf(false) }
  var message by remember { mutableStateOf("") }
  var activationPaid by remember { mutableStateOf(false) }
  var activationBusy by remember { mutableStateOf(false) }
  var activationMessage by remember { mutableStateOf("") }

  LaunchedEffect(apiUrl) {
    val token = SecureTokenStore.load(context)
    if (!token.isNullOrBlank() && apiUrl.isNotBlank()) {
      try {
        val profile = ChaufrApi.driverProfile(apiUrl, token)
        available = profile.optBoolean("isOnline", false)
        activationPaid = ChaufrApi.driverActivation(apiUrl, token).optBoolean("isPaid", false)
      } catch (_: Exception) {
        available = false
      }
    }
  }

  LaunchedEffect(apiUrl) {
    val token = SecureTokenStore.load(context)
    if (!token.isNullOrBlank() && apiUrl.isNotBlank()) {
      while (true) {
        try { activationPaid = ChaufrApi.driverActivation(apiUrl, token).optBoolean("isPaid", false) }
        catch (_: Exception) { }
        kotlinx.coroutines.delay(12000)
      }
    }
  }

  fun lastKnownLocation(): Location? {
    val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    if (!fine && !coarse) return null
    return try {
      if (fine) locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
        ?: locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
      else locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
    } catch (_: Exception) { null }
  }

  // A visible foreground service keeps location updates running after the driver leaves this screen.
  // It is started only while the driver has explicitly chosen to be online.
  LaunchedEffect(available) {
    if (available) DriverLocationService.start(context)
    else DriverLocationService.stop(context)
  }

  fun sendPresence(online: Boolean) {
    if (apiUrl.isBlank()) {
      message = "Live availability will work after the Chaufr server is connected."
      return
    }
    val token = SecureTokenStore.load(context)
    if (token.isNullOrBlank()) {
      message = "Sign in to your driver account before changing availability."
      return
    }
    scope.launch {
      busy = true
      message = ""
      try {
        val result = if (online) {
          val location = lastKnownLocation()
            ?: throw IllegalStateException("Location is unavailable. Turn on location and try again.")
          ChaufrApi.setDriverPresence(
            apiUrl, token, true, location.latitude, location.longitude,
            if (location.hasAccuracy()) location.accuracy.toDouble() else null
          )
        } else {
          ChaufrApi.setDriverPresence(apiUrl, token, false)
        }
        available = result.optBoolean("isOnline", online)
        if (available) DriverLocationService.start(context) else DriverLocationService.stop(context)
        message = if (available) "Online · background location sharing is active." else "You are now offline. Location sharing has stopped."
      } catch (error: Exception) {
        message = error.message ?: "Unable to update driver availability."
      } finally { busy = false }
    }
  }

  val permissionLauncher = rememberLauncherForActivityResult(
    ActivityResultContracts.RequestMultiplePermissions()
  ) { results ->
    val locationGranted = results[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
      results[Manifest.permission.ACCESS_COARSE_LOCATION] == true
    if (locationGranted) sendPresence(true)
    else message = "Location permission is needed before you can go online."
  }

  fun requestPresence(online: Boolean) {
    if (online) {
      val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
      val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
      if (!fine && !coarse) {
        val permissions = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION) +
          if (Build.VERSION.SDK_INT >= 33) arrayOf(Manifest.permission.POST_NOTIFICATIONS) else emptyArray()
        permissionLauncher.launch(permissions)
        return
      }
    }
    sendPresence(online)
  }

  Card(
    modifier = Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(18.dp),
    colors = CardDefaults.cardColors(containerColor = Color.White),
    elevation = CardDefaults.cardElevation(defaultElevation = 5.dp)
  ) {
    Column(modifier = Modifier.padding(17.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
          Text("DRIVER AVAILABILITY", color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
          Spacer(Modifier.height(5.dp))
          Text(if (available) "You're online" else "You're offline", color = Navy, fontSize = 21.sp, fontWeight = FontWeight.Bold)
          Text("Availability is controlled by your verified driver account.", color = Muted, fontSize = 11.sp)
        }
        Switch(checked = available, onCheckedChange = { requestPresence(it) }, enabled = !busy && activationPaid)
      }
      if (!activationPaid) {
        Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF1FC))) {
          Column(modifier = Modifier.padding(13.dp)) {
            Text("DAILY ACTIVATION · R30", color = Blue, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text("Pay today's non-refundable activation fee before going online or viewing trip requests.", color = Navy, fontSize = 11.sp)
            Spacer(Modifier.height(8.dp))
            Button(
              onClick = {
                val token = SecureTokenStore.load(context)
                if (token != null && !activationBusy) scope.launch {
                  activationBusy = true
                  activationMessage = ""
                  try {
                    val checkout = ChaufrApi.createActivationCheckout(apiUrl, token)
                    val checkoutUrl = checkout.optString("checkoutUrl")
                    if (!checkoutUrl.startsWith("https://")) throw IllegalStateException("Secure payment link unavailable.")
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(checkoutUrl)))
                    activationMessage = "Secure Paystack checkout opened. Activation updates after payment verification."
                  } catch (error: Exception) {
                    activationMessage = error.message ?: "Unable to start activation payment."
                  } finally { activationBusy = false }
                }
              },
              enabled = !activationBusy && apiUrl.isNotBlank(),
              modifier = Modifier.fillMaxWidth(),
              colors = ButtonDefaults.buttonColors(containerColor = Blue)
            ) { Text(if (activationBusy) "Opening checkout..." else "Pay R30 securely") }
            if (activationMessage.isNotBlank()) Text(activationMessage, color = Muted, fontSize = 10.sp)
          }
        }
      } else {
        Text("Today's R30 activation is paid.", color = Green, fontSize = 11.sp, fontWeight = FontWeight.Bold)
      }
      Spacer(Modifier.height(12.dp))
      Button(
        onClick = { requestPresence(!available) },
        enabled = !busy && activationPaid,
        modifier = Modifier.fillMaxWidth().height(48.dp),
        shape = RoundedCornerShape(18.dp),
        colors = ButtonDefaults.buttonColors(containerColor = if (available) Navy else Blue)
      ) {
        Text(if (busy) "Updating..." else if (available) "Go offline" else "Go online", fontWeight = FontWeight.Bold)
      }
      if (message.isNotBlank()) {
        Spacer(Modifier.height(8.dp))
        Text(message, color = if (message.contains("sent") || message.contains("offline")) Green else Color(0xFFB42318), fontSize = 11.sp)
      }
      if (apiUrl.isBlank()) {
        Spacer(Modifier.height(6.dp))
        Text("Connect the Chaufr API to enable live availability.", color = Muted, fontSize = 10.sp)
      }
    }
  }
}

@Composable
private fun SummaryCard(title: String, value: String, modifier: Modifier = Modifier) {
  Card(
    modifier = modifier,
    shape = RoundedCornerShape(16.dp),
    colors = CardDefaults.cardColors(containerColor = Color.White)
  ) {
    Column(modifier = Modifier.padding(15.dp)) {
      Text(title, color = Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
      Spacer(Modifier.height(7.dp))
      Text(value, color = Navy, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
    }
  }
}


@Composable
private fun DriverCurrentTripCard() {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val apiUrl = BuildConfig.CHAUFR_API_BASE_URL
  var trip by remember { mutableStateOf<JSONObject?>(null) }
  var busy by remember { mutableStateOf(false) }
  var message by remember { mutableStateOf("") }
  var completedRewardTripId by remember { mutableStateOf<String?>(null) }
  var commissionRequested by remember { mutableStateOf(false) }
  var safetyNotes by remember { mutableStateOf("") }
  var safetyMessage by remember { mutableStateOf("") }
  var safetyBusy by remember { mutableStateOf(false) }
  var trustedName by remember { mutableStateOf("") }
  var trustedPhone by remember { mutableStateOf("") }

  suspend fun refreshCurrent() {
    if (apiUrl.isBlank()) return
    val token = SecureTokenStore.load(context) ?: return
    try {
      val result = ChaufrApi.currentDriverTrip(apiUrl, token)
      trip = result.optJSONObject("trip")
    } catch (error: Exception) {
      if (message.isBlank()) message = error.message ?: "Unable to check your current trip."
    }
  }

  LaunchedEffect(apiUrl) {
    while (true) {
      refreshCurrent()
      delay(10_000)
    }
  }

  val current = trip
  Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp),
    colors = CardDefaults.cardColors(containerColor = Color.White)) {
    Column(modifier = Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Text("CURRENT TRIP", color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
      if (current == null) {
        Text("No accepted trip in progress.", color = Navy, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
      } else {
        val status = current.optString("status")
        Text(if (status == "accepted") "Trip accepted · Head to pickup" else "Trip in progress",
          color = Navy, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        Text(current.optString("pickupLabel"), color = Navy, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Text("↓ " + current.optString("destinationLabel"), color = Muted, fontSize = 12.sp)
        Text(String.format(Locale.US, "%.1f km · %d min", current.optDouble("distanceKm", 0.0),
          current.optDouble("durationMinutes", 0.0).toInt()), color = Muted, fontSize = 11.sp)
        Text("Expected earnings: R " + String.format(Locale.US, "%.2f",
          current.optDouble("expectedDriverEarnings", 0.0)), color = Green, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        current.optString("passengerUserId").takeIf { it.isNotBlank() }?.let { passengerUserId ->
          Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF7ED))) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
              Text("SAFETY SHIELD", color = Navy, fontWeight = FontWeight.Bold, fontSize = 11.sp)
              Text("Report a concern about this passenger or block future matching.", color = Muted, fontSize = 11.sp)
              OutlinedTextField(value = trustedName, onValueChange = { trustedName = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Trusted contact name") }, singleLine = true)
              OutlinedTextField(value = trustedPhone, onValueChange = { trustedPhone = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Contact phone (+27...)") }, singleLine = true)
              Button(onClick = {
                val token = SecureTokenStore.load(context)
                if (token != null) scope.launch {
                  try {
                    ChaufrApi.addTrustedContact(apiUrl, token, trustedName, trustedPhone, "trusted contact")
                    safetyMessage = "Trusted contact saved."
                    trustedName = ""; trustedPhone = ""
                  } catch (error: Exception) { safetyMessage = error.message ?: "Could not save trusted contact." }
                }
              }, modifier = Modifier.fillMaxWidth()) { Text("Save trusted contact") }
              Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                  val token = SecureTokenStore.load(context)
                  if (token != null) scope.launch {
                    safetyBusy = true
                    try {
                      val result = ChaufrApi.triggerSafetySos(apiUrl, token, current.optString("tripId"))
                      safetyMessage = "SOS recorded. " + result.optString("message")
                    } catch (error: Exception) { safetyMessage = error.message ?: "SOS could not be sent." }
                    finally { safetyBusy = false }
                  }
                }, enabled = !safetyBusy, modifier = Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFB42318))) { Text("SOS") }
                Button(onClick = {
                  val token = SecureTokenStore.load(context)
                  if (token != null) scope.launch {
                    try {
                      val share = ChaufrApi.createTripShare(apiUrl, token, current.optString("tripId"))
                      safetyMessage = apiUrl.trimEnd('/') + "/v1/shared-trips/" + share.optString("shareToken")
                    } catch (error: Exception) { safetyMessage = error.message ?: "Could not create trip share." }
                  }
                }, modifier = Modifier.weight(1f)) { Text("Share trip") }
              }
              OutlinedTextField(value = safetyNotes, onValueChange = { safetyNotes = it.take(500) }, modifier = Modifier.fillMaxWidth(), label = { Text("Report details (optional)") }, shape = RoundedCornerShape(12.dp), minLines = 2)
              Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                  val token = SecureTokenStore.load(context)
                  if (token == null) safetyMessage = "Sign in to submit a safety report."
                  else scope.launch {
                    safetyBusy = true
                    try {
                      ChaufrApi.reportSafetyParticipant(apiUrl, token, current.optString("tripId"), passengerUserId, "other", safetyNotes)
                      safetyMessage = "Safety report submitted securely."
                      safetyNotes = ""
                    } catch (error: Exception) { safetyMessage = error.message ?: "Unable to submit report." }
                    finally { safetyBusy = false }
                  }
                }, enabled = !safetyBusy, modifier = Modifier.weight(1f)) { Text("Report passenger") }
                Button(onClick = {
                  val token = SecureTokenStore.load(context)
                  if (token == null) safetyMessage = "Sign in to block a passenger."
                  else scope.launch {
                    safetyBusy = true
                    try {
                      ChaufrApi.blockSafetyParticipant(apiUrl, token, current.optString("tripId"), passengerUserId)
                      safetyMessage = "Passenger blocked from future matching."
                    } catch (error: Exception) { safetyMessage = error.message ?: "Unable to block passenger." }
                    finally { safetyBusy = false }
                  }
                }, enabled = !safetyBusy, modifier = Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF9F2D20))) { Text("Block passenger") }
              }
              if (safetyMessage.isNotBlank()) Text(safetyMessage, color = Navy, fontSize = 11.sp)
            }
          }
        }
        Button(onClick = {
          scope.launch {
            busy = true
            try {
              val token = SecureTokenStore.load(context) ?: throw IllegalStateException("Sign in to your driver account.")
              val id = current.optString("tripId")
              if (status == "accepted") {
                ChaufrApi.startTrip(apiUrl, token, id)
                message = "Trip started. Drive safely."
              } else {
                ChaufrApi.completeTrip(apiUrl, token, id)
                if (current.optBoolean("rewardRedemption")) {
                  completedRewardTripId = id
                  commissionRequested = false
                }
                message = "Trip completed. Your trip has been recorded."
              }
              refreshCurrent()
            } catch (error: Exception) {
              message = error.message ?: "Unable to update trip status."
            } finally { busy = false }
          }
        }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
          Text(if (busy) "Updating trip…" else if (status == "accepted") "Start trip" else "Complete trip")
        }
      }
      if (completedRewardTripId != null) {
        Text("Reward ride completed. You can request the platform-funded 50% driver payout.", color = Navy, fontSize = 12.sp)
        Button(onClick = {
          scope.launch {
            busy = true
            try {
              val token = SecureTokenStore.load(context) ?: throw IllegalStateException("Sign in to your driver account.")
              val result = ChaufrApi.requestRewardCommission(apiUrl, token, completedRewardTripId!!)
              commissionRequested = true
              message = "Payout request recorded: R " + String.format(Locale.US, "%.2f", result.optDouble("amount"))
            } catch (error: Exception) {
              message = error.message ?: "Unable to submit payout request."
            } finally { busy = false }
          }
        }, enabled = !busy && !commissionRequested, modifier = Modifier.fillMaxWidth()) {
          Text(if (commissionRequested) "Commission requested" else "Request commission")
        }
      }
      if (message.isNotBlank()) Text(message, color = if (message.contains("started") || message.contains("completed")) Green else Color(0xFFB42318), fontSize = 11.sp, lineHeight = 16.sp)
    }
  }
}

@Composable
private fun AvailableTripsCard() {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val apiUrl = BuildConfig.CHAUFR_API_BASE_URL
  var trips by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
  var loading by remember { mutableStateOf(false) }
  var message by remember { mutableStateOf("") }
  var acceptingId by remember { mutableStateOf<String?>(null) }

  suspend fun refresh() {
    val token = SecureTokenStore.load(context) ?: return
    if (apiUrl.isBlank()) return
    loading = true
    try {
      val result = ChaufrApi.availableTrips(apiUrl, token)
      val array = result.optJSONArray("trips")
      trips = (0 until (array?.length() ?: 0)).mapNotNull { array?.optJSONObject(it) }
      if (message.startsWith("Unable")) message = ""
    } catch (error: Exception) {
      trips = emptyList()
      message = error.message ?: "Unable to load trip requests."
    } finally { loading = false }
  }

  LaunchedEffect(apiUrl) {
    while (true) {
      refresh()
      delay(20_000)
    }
  }

  Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
    Column(modifier = Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
          Text("AVAILABLE TRIPS", color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
          Text(if (loading) "Checking requests…" else trips.size.toString() + " requests", color = Navy, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
        Button(onClick = { scope.launch { refresh() } }, enabled = !loading) { Text("Refresh") }
      }
      if (apiUrl.isBlank()) {
        Text("Trip requests will appear here when the Chaufr API is connected and your account is approved, activated and online.", color = Muted, fontSize = 12.sp, lineHeight = 18.sp)
      } else if (trips.isEmpty()) {
        Text("No requests currently available. Requests are checked automatically every 20 seconds while this screen is open.", color = Muted, fontSize = 12.sp, lineHeight = 18.sp)
      }
      trips.forEach { trip ->
        val id = trip.optString("tripId")
        Card(shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFFF2F6FC))) {
          Column(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(trip.optString("pickupLabel", "Pickup"), color = Navy, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            Text("↓ " + trip.optString("destinationLabel", "Destination"), color = Muted, fontSize = 12.sp)
            Text(String.format(Locale.US, "%.1f km · %d min", trip.optDouble("distanceKm", 0.0), trip.optDouble("durationMinutes", 0.0).toInt()), color = Muted, fontSize = 11.sp)
            Text("Driver earnings after commission: R " + String.format(Locale.US, "%.2f", trip.optDouble("expectedDriverEarnings", 0.0)), color = Green, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text("Estimated vehicle costs: R " + String.format(Locale.US, "%.2f", trip.optDouble("estimatedOperatingCost", 0.0)), color = Muted, fontSize = 12.sp)
            Text("Estimated net: R " + String.format(Locale.US, "%.2f", trip.optDouble("estimatedNetEarnings", trip.optDouble("expectedDriverEarnings", 0.0))), color = Navy, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text("Estimate excludes pickup fuel/costs and may change with your actual route and vehicle expenses.", color = Muted, fontSize = 10.sp, lineHeight = 14.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
              Button(onClick = {
                scope.launch {
                  acceptingId = id
                  message = ""
                  try {
                    val token = SecureTokenStore.load(context) ?: throw IllegalStateException("Sign in to accept trips.")
                    val accepted = ChaufrApi.acceptTrip(apiUrl, token, id)
                    message = "Trip accepted. Pickup: " + accepted.optString("pickupLabel") + ". Fare locked."
                    trips = trips.filterNot { it.optString("tripId") == id }
                    refresh()
                  } catch (error: Exception) { message = error.message ?: "Unable to accept trip." }
                  finally { acceptingId = null }
                }
              }, enabled = acceptingId == null, modifier = Modifier.weight(1f)) {
                Text(if (acceptingId == id) "ACCEPTING…" else "✓  ACCEPT RIDE")
              }
              OutlinedButton(onClick = {
                scope.launch {
                  acceptingId = id
                  message = ""
                  try {
                    val token = SecureTokenStore.load(context) ?: throw IllegalStateException("Sign in to decline trips.")
                    ChaufrApi.declineTrip(apiUrl, token, id)
                    message = "Offer declined. Chaufr will find the next eligible driver."
                    trips = trips.filterNot { it.optString("tripId") == id }
                    refresh()
                  } catch (error: Exception) { message = error.message ?: "Unable to decline offer." }
                  finally { acceptingId = null }
                }
              }, enabled = acceptingId == null, modifier = Modifier.weight(1f)) {
                Text("PASS")
              }
            }
          }
        }
      }
      if (message.isNotBlank()) Text(message, color = if (message.contains("accepted")) Green else Color(0xFFB42318), fontSize = 11.sp, lineHeight = 16.sp)
    }
  }
}
