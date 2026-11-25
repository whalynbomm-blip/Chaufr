package za.co.chaufr.driver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Explicitly started only after the driver chooses Go online.
 * The persistent notification makes location sharing visible while the app is backgrounded.
 */
class DriverLocationService : Service(), LocationListener {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var locationManager: LocationManager
    private var lastSentAt = 0L

    override fun onCreate() {
        super.onCreate()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopLocationUpdates()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val token = SecureTokenStore.load(this)
        if (token.isNullOrBlank() || BuildConfig.CHAUFR_API_BASE_URL.isBlank()) {
            stopSelf()
            return START_NOT_STICKY
        }

        startForeground(NOTIFICATION_ID, buildNotification())
        try {
            if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED) {
                if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15_000L, 20f, this, Looper.getMainLooper())
                }
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 30_000L, 40f, this, Looper.getMainLooper())
            } else {
                stopSelf()
            }
        } catch (_: SecurityException) {
            stopSelf()
        } catch (_: IllegalArgumentException) {
            // A provider may be unavailable on a device; the other provider can still report.
        }
        return START_STICKY
    }

    @Deprecated("Deprecated by Android")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) { }

    override fun onProviderEnabled(provider: String) { }

    override fun onProviderDisabled(provider: String) { }

    override fun onLocationChanged(location: Location) {
        val now = System.currentTimeMillis()
        if (now - lastSentAt < 10_000L) return
        lastSentAt = now
        val token = SecureTokenStore.load(this) ?: return
        serviceScope.launch {
            try {
                ChaufrApi.setDriverPresence(
                    BuildConfig.CHAUFR_API_BASE_URL,
                    token,
                    true,
                    location.latitude,
                    location.longitude,
                    if (location.hasAccuracy()) location.accuracy.toDouble() else null
                )
            } catch (_: Exception) {
                // Keep the service alive and retry with the next location update.
            }
        }
    }

    private fun buildNotification(): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Chaufr location sharing is active")
            .setContentText("Your location is shared with Chaufr while you are online.")
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Driver location sharing",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun stopLocationUpdates() {
        try { locationManager.removeUpdates(this) } catch (_: Exception) { }
    }

    override fun onDestroy() {
        stopLocationUpdates()
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL_ID = "chaufr_driver_location"
        private const val NOTIFICATION_ID = 4102
        const val ACTION_START = "za.co.chaufr.driver.LOCATION_START"
        const val ACTION_STOP = "za.co.chaufr.driver.LOCATION_STOP"

        fun start(context: Context) {
            val intent = Intent(context, DriverLocationService::class.java).setAction(ACTION_START)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
            else context.startService(intent)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, DriverLocationService::class.java).setAction(ACTION_STOP))
        }
    }
}
