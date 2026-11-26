package za.co.chaufr.driver

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun DriverFeedbackSupportPanel() {
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    var tripId by remember { mutableStateOf("") }
    var score by remember { mutableStateOf(5) }
    var ratingComment by remember { mutableStateOf("") }
    var subject by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("trip") }
    var status by remember { mutableStateOf("") }
    var tickets by remember { mutableStateOf("") }
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("RATE YOUR PASSENGER", style = MaterialTheme.typography.titleMedium)
            Text("Rate a passenger after completing the trip. One rating per ride.")
            OutlinedTextField(tripId, { tripId = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Completed trip ID") }, singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) { (1..5).forEach { n -> FilterChip(selected = score == n, onClick = { score = n }, label = { Text("$n ★") }) } }
            OutlinedTextField(ratingComment, { ratingComment = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Optional comment") }, maxLines = 2)
            Button(modifier = Modifier.fillMaxWidth(), onClick = { scope.launch {
                status = try { val token = SecureTokenStore.load(context) ?: throw Exception("Please sign in."); ChaufrApi.submitTripRating(BuildConfig.CHAUFR_API_BASE_URL,token,tripId.trim(),score,ratingComment); "Rating submitted." } catch(e:Exception) { e.message ?: "Rating failed." }
            } }, enabled = tripId.isNotBlank()) { Text("Submit rating") }
            Divider()
            Text("DRIVER SUPPORT", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(subject, { subject = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Subject") }, singleLine = true)
            OutlinedTextField(message, { message = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Describe the problem") }, minLines = 2)
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) { listOf("trip","payment","account","safety","general").forEach { FilterChip(selected = category == it, onClick = { category = it }, label = { Text(it.replaceFirstChar(Char::uppercase)) }) } }
            Button(modifier = Modifier.fillMaxWidth(), onClick = { scope.launch {
                status = try { val token = SecureTokenStore.load(context) ?: throw Exception("Please sign in."); ChaufrApi.createSupportTicket(BuildConfig.CHAUFR_API_BASE_URL,token,subject,message,category); subject="";message=""; "Support ticket submitted." } catch(e:Exception) { e.message ?: "Ticket failed." }
            } }, enabled = subject.length>=3 && message.length>=10) { Text("Send support request") }
            OutlinedButton(modifier = Modifier.fillMaxWidth(), onClick = { scope.launch {
                tickets = try { val token = SecureTokenStore.load(context) ?: throw Exception("Please sign in."); ChaufrApi.mySupportTickets(BuildConfig.CHAUFR_API_BASE_URL,token).getJSONArray("tickets").let { arr -> (0 until arr.length()).joinToString("\n") { i -> val t=arr.getJSONObject(i); "• "+t.optString("subject")+" — "+t.optString("status")+(if(t.isNull("owner_reply")) "" else "\nReply: "+t.optString("owner_reply")) } }.ifBlank { "No tickets yet." } } catch(e:Exception) { e.message ?: "Unable to load tickets." }
            } }) { Text("View my support tickets") }
            if(status.isNotBlank()) Text(status)
            if(tickets.isNotBlank()) Text(tickets, style = MaterialTheme.typography.bodySmall)
        }
    }
}
