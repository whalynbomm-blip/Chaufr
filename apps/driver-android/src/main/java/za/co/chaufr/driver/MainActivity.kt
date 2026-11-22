package za.co.chaufr.driver

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
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent { MaterialTheme { DriverHome() } }
  }
}

@Composable
private fun DriverHome() {
  var available by remember { mutableStateOf(false) }
  Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
    Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.Center) {
      Text("Chaufr Driver", style = MaterialTheme.typography.headlineLarge)
      Text("Drive with clear earnings.", style = MaterialTheme.typography.titleMedium)
      Spacer(Modifier.height(28.dp))
      Text(if (available) "You are marked as available." else "You are currently offline.")
      Spacer(Modifier.height(12.dp))
      Button(onClick = { available = !available }, modifier = Modifier.fillMaxWidth()) {
        Text(if (available) "Go offline" else "Go online")
      }
      Spacer(Modifier.height(16.dp))
      Text("Early development build • Driver verification and live trip offers are not connected yet.")
    }
  }
}
