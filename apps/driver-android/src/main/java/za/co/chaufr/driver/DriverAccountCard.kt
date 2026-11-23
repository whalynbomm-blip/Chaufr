package za.co.chaufr.driver

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun DriverAccountCard() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val apiUrl = BuildConfig.CHAUFR_API_BASE_URL
    var token by remember { mutableStateOf<String?>(null) }
    var displayName by remember { mutableStateOf("") }
    var identifier by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var registering by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }

    LaunchedEffect(apiUrl) {
        val saved = SecureTokenStore.load(context)
        if (!saved.isNullOrBlank() && apiUrl.isNotBlank()) {
            try {
                val user = ChaufrApi.currentAccount(apiUrl, saved)
                token = saved
                displayName = user.optString("displayName")
                identifier = user.optString("email").ifBlank { user.optString("phone") }
            } catch (_: Exception) {
                SecureTokenStore.clear(context)
            }
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(
            modifier = Modifier.padding(17.dp),
            verticalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Text("DRIVER ACCOUNT", color = Color(0xFF101C2C), fontWeight = FontWeight.Bold)
            if (token != null) {
                Text("Signed in as $displayName", color = Color(0xFF53647A))
                Text("Your Chaufr account session is active on this device.", color = Color(0xFF8291A5))
                Button(
                    onClick = {
                        if (!busy) scope.launch {
                            busy = true
                            try {
                                ChaufrApi.logoutAccount(apiUrl, token!!)
                                SecureTokenStore.clear(context)
                                token = null
                                password = ""
                                message = "You have been signed out."
                            } catch (error: Exception) {
                                message = error.message ?: "Unable to sign out."
                            } finally { busy = false }
                        }
                    },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth()
                ) { Text(if (busy) "Please wait..." else "Sign out") }
            } else {
                Text(
                    if (registering) "Create your driver account." else "Sign in to your driver account.",
                    color = Color(0xFF53647A)
                )
                if (registering) {
                    OutlinedTextField(
                        value = displayName, onValueChange = { displayName = it },
                        modifier = Modifier.fillMaxWidth(), label = { Text("Full name") }, singleLine = true
                    )
                }
                OutlinedTextField(
                    value = identifier, onValueChange = { identifier = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(if (registering) "Email address (optional)" else "Email or phone number") },
                    singleLine = true
                )
                if (registering) {
                    OutlinedTextField(
                        value = phone, onValueChange = { phone = it },
                        modifier = Modifier.fillMaxWidth(), label = { Text("Phone in international format (optional)") },
                        singleLine = true
                    )
                }
                OutlinedTextField(
                    value = password, onValueChange = { password = it },
                    modifier = Modifier.fillMaxWidth(), label = { Text("Password") },
                    singleLine = true, visualTransformation = PasswordVisualTransformation()
                )
                Button(
                    onClick = {
                        if (!busy) scope.launch {
                            busy = true
                            message = ""
                            try {
                                if (apiUrl.isBlank()) {
                                    throw IllegalStateException("Account services will be available when the Chaufr server is connected.")
                                }
                                val result = if (registering) {
                                    ChaufrApi.registerAccount(
                                        apiUrl, displayName, identifier, phone, password, "driver"
                                    )
                                } else {
                                    ChaufrApi.loginAccount(apiUrl, identifier, password)
                                }
                                val newToken = result.getString("accessToken")
                                SecureTokenStore.save(context, newToken)
                                token = newToken
                                displayName = result.getJSONObject("user").optString("displayName")
                                password = ""
                                message = if (registering) "Your driver account has been created. Verification is required before accepting trips." else "Welcome back."
                            } catch (error: Exception) {
                                message = error.message ?: "Unable to access your account."
                            } finally { busy = false }
                        }
                    },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth()
                ) { Text(if (busy) "Please wait..." else if (registering) "Create account" else "Sign in") }
                TextButton(onClick = { registering = !registering; message = "" }) {
                    Text(if (registering) "Already have an account? Sign in" else "New to Chaufr? Create account")
                }
            }
            if (message.isNotBlank()) Text(message, color = Color(0xFF53647A))
            if (apiUrl.isBlank()) {
                Text("Account connection is not configured in this test build yet.", color = Color(0xFF8291A5))
            }
            Spacer(Modifier.height(2.dp))
        }
    }
}
