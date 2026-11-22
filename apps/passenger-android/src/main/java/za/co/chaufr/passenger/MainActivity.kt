package za.co.chaufr.passenger

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent { MaterialTheme { PassengerHome() } }
  }
}

@Composable
private fun PassengerHome() {
  var pickup by remember { mutableStateOf("") }
  var destination by remember { mutableStateOf("") }
  Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
    Column(
      modifier = Modifier.padding(24.dp),
      verticalArrangement = Arrangement.Center
    ) {
      Text("Chaufr", style = MaterialTheme.typography.headlineLarge)
      Text("Your ride. One clear price.", style = MaterialTheme.typography.titleMedium)
      Spacer(Modifier.height(28.dp))
      OutlinedTextField(pickup, { pickup = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Pickup location") })
      Spacer(Modifier.height(12.dp))
      OutlinedTextField(destination, { destination = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Where to?") })
      Spacer(Modifier.height(20.dp))
      Button(
        onClick = { /* Route lookup and server fare quote will be wired to the API. */ },
        enabled = pickup.isNotBlank() && destination.isNotBlank(),
        modifier = Modifier.fillMaxWidth()
      ) { Text("Get fixed fare") }
      Spacer(Modifier.height(16.dp))
      Text("Early development build • Fare quotes will be supplied by Chaufr's server.")
    }
  }
}
