package za.co.chaufr.driver

import android.os.Bundle
import androidx.activity.ComponentActivity
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
  var available by remember { mutableStateOf(false) }
  Surface(modifier = Modifier.fillMaxSize(), color = Page) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
      Column(
        modifier = Modifier.fillMaxWidth().background(Navy).padding(horizontal = 22.dp, vertical = 24.dp)
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
        Text("Good day, Driver", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Bold)
        Text("Your driving day starts here.", color = Color(0xFFB8C7DA), fontSize = 13.sp)
      }

      Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Card(
          modifier = Modifier.fillMaxWidth(),
          shape = RoundedCornerShape(18.dp),
          colors = CardDefaults.cardColors(containerColor = Color.White),
          elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
          Column(modifier = Modifier.padding(17.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
              Column(modifier = Modifier.weight(1f)) {
                Text("DRIVER AVAILABILITY", color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                Spacer(Modifier.height(5.dp))
                Text(if (available) "You're online" else "You're offline", color = Navy, fontSize = 21.sp, fontWeight = FontWeight.Bold)
                Text(if (available) "Demo status only — not visible to passengers." else "Go online when you're ready to receive trips.", color = Muted, fontSize = 11.sp)
              }
              Switch(checked = available, onCheckedChange = { available = it })
            }
            Spacer(Modifier.height(12.dp))
            Button(
              onClick = { available = !available },
              modifier = Modifier.fillMaxWidth().height(48.dp),
              shape = RoundedCornerShape(12.dp),
              colors = ButtonDefaults.buttonColors(containerColor = if (available) Navy else Blue)
            ) {
              Text(if (available) "Go offline" else "Go online", fontWeight = FontWeight.Bold)
            }
          }
        }

        Text("TODAY'S SUMMARY", color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          SummaryCard("EARNINGS", "R 0.00", Modifier.weight(1f))
          SummaryCard("TRIPS", "0", Modifier.weight(1f))
        }

        Card(
          modifier = Modifier.fillMaxWidth(),
          shape = RoundedCornerShape(18.dp),
          colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
          Column(modifier = Modifier.padding(17.dp)) {
            Text("YOUR VEHICLE", color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
            Spacer(Modifier.height(8.dp))
            Text("Vehicle profile not set up", color = Navy, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Text("Add your vehicle details and documents during driver onboarding. Verification will be required before accepting real trips.", color = Muted, fontSize = 12.sp, lineHeight = 18.sp)
            Spacer(Modifier.height(12.dp))
            Text("DRIVER VERIFICATION", color = Blue, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text("Not submitted", color = Navy, fontSize = 13.sp)
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
