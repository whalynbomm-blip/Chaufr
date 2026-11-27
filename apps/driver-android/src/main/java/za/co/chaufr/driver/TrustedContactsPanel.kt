package za.co.chaufr.driver

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable
fun DriverTrustedContactsPanel() {
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    val apiUrl = BuildConfig.CHAUFR_API_BASE_URL
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var relationship by remember { mutableStateOf("Family") }
    var contacts by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }

    suspend fun refresh() {
        val token = SecureTokenStore.load(context) ?: throw IllegalStateException("Sign in to manage trusted contacts.")
        val response = ChaufrApi.trustedContacts(apiUrl, token)
        val array = response.optJSONArray("contacts")
        contacts = (0 until (array?.length() ?: 0)).mapNotNull { array?.optJSONObject(it) }
    }

    LaunchedEffect(apiUrl) {
        if (apiUrl.isNotBlank() && SecureTokenStore.load(context) != null) {
            runCatching { refresh() }.onFailure { message = it.message ?: "Unable to load trusted contacts." }
        }
    }

    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("TRUSTED EMERGENCY CONTACTS", style = MaterialTheme.typography.titleMedium)
            Text("Manage who should be notified by Chaufr safety alerts. Contact ownership is not yet independently verified.", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
            OutlinedTextField(name, { name = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Contact name") }, singleLine = true)
            OutlinedTextField(phone, { phone = it }, modifier = Modifier.fillMaxWidth(), label = { Text("International phone (+2782...)") }, singleLine = true)
            OutlinedTextField(relationship, { relationship = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Relationship") }, singleLine = true)
            Button(modifier = Modifier.fillMaxWidth(), enabled = !busy && name.trim().length >= 2 && phone.startsWith("+"),
                onClick = { scope.launch {
                    busy = true
                    message = ""
                    try {
                        val token = SecureTokenStore.load(context) ?: throw IllegalStateException("Sign in first.")
                        ChaufrApi.addTrustedContact(apiUrl, token, name.trim(), phone.trim(), relationship.trim())
                        name = ""; phone = ""
                        refresh()
                        message = "Trusted contact saved."
                    } catch (error: Exception) { message = error.message ?: "Unable to save contact." }
                    finally { busy = false }
                } }) { Text(if (busy) "Saving…" else "Add trusted contact") }
            OutlinedButton(modifier = Modifier.fillMaxWidth(), enabled = !busy,
                onClick = { scope.launch {
                    busy = true
                    try { refresh(); message = "" }
                    catch (error: Exception) { message = error.message ?: "Unable to refresh contacts." }
                    finally { busy = false }
                } }) { Text("Refresh contacts") }
            contacts.forEach { contact ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(contact.optString("contact_name"), style = MaterialTheme.typography.bodyMedium)
                        Text(contact.optString("phone_e164") + " · " + contact.optString("relationship"), style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                    }
                    TextButton(enabled = !busy, onClick = { scope.launch {
                        busy = true
                        try {
                            val token = SecureTokenStore.load(context) ?: throw IllegalStateException("Sign in first.")
                            ChaufrApi.deleteTrustedContact(apiUrl, token, contact.optString("id"))
                            contacts = contacts.filterNot { it.optString("id") == contact.optString("id") }
                            message = "Contact removed."
                        } catch (error: Exception) { message = error.message ?: "Unable to remove contact." }
                        finally { busy = false }
                    } }) { Text("Remove") }
                }
                Divider()
            }
            if (contacts.isEmpty()) Text("No trusted contacts saved yet.", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
            if (message.isNotBlank()) Text(message, style = MaterialTheme.typography.bodySmall)
        }
    }
}
