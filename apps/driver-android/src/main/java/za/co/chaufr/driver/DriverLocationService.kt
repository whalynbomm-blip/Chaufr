package za.co.chaufr.driver

import android.app.Notification
import android.app.NotificationChannel
import android.app.PendingIntent
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
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
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
    private var offerPollingJob: Job? = null
    private val notifiedOfferIds = mutableSetOf<String>()

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
        startOfferPolling(token)
        try {
            if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED) {
                val hasFine = checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED
                if (hasFine) {
                    try {
                        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10_000L, 10f, this, Looper.getMainLooper())
                    } catch (_: IllegalArgumentException) {
                        // GPS may be unavailable indoors; network provider remains active.
                    }
                }
                try {
                    locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 20_000L, 25f, this, Looper.getMainLooper())
                } catch (_: IllegalArgumentException) {
                    // Some devices do not expose a network location provider.
                }
                // Publish a cached fix immediately so a newly-online driver is not invisible
                // while waiting for the first fresh GPS callback.
                val cachedFix = try {
                    if (hasFine) locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                        ?: locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                    else locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                } catch (_: Exception) { null }
                cachedFix?.let { onLocationChanged(it) }
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
            .setContentText("Location sharing is active. Allow background location and unrestricted battery use for reliable updates.")
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(CHANNEL_ID, "Driver location sharing", NotificationManager.IMPORTANCE_LOW)
            val offersChannel = NotificationChannel(OFFERS_CHANNEL_ID, "New Chaufr trip offers", NotificationManager.IMPORTANCE_HIGH)
                .apply { description = "Alerts for trip requests while you are online." }
            manager.createNotificationChannel(channel)
            manager.createNotificationChannel(offersChannel)
        }
    }

    private fun startOfferPolling(token: String) {
        if (offerPollingJob?.isActive == true) return
        offerPollingJob = serviceScope.launch {
            while (true) {
                try {
                    val result = ChaufrApi.availableTrips(BuildConfig.CHAUFR_API_BASE_URL, token)
                    val trips = result.optJSONArray("trips")
                    for (index in 0 until (trips?.length() ?: 0)) {
                        val trip = trips?.optJSONObject(index) ?: continue
                        val tripId = trip.optString("tripId")
                        if (tripId.isBlank() || !notifiedOfferIds.add(tripId)) continue
                        showTripOfferNotification(
                            tripId,
                            trip.optString("pickupLabel", "Pickup location"),
                            trip.optString("destinationLabel", "Destination")
                        )
                    }
                } catch (_: Exception) {
                    // Retry on the next interval; location sharing remains independent.
                }
                delay(15_000L)
            }
        }
    }

    private fun showTripOfferNotification(tripId: String, pickup: String, destination: String) {
        val openApp = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, tripId.hashCode(), openApp,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, OFFERS_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_directions)
            .setContentTitle("New Chaufr trip request")
            .setContentText(pickup + " → " + destination)
            .setStyle(NotificationCompat.BigTextStyle().bigText("Pickup: " + pickup + "\nDestination: " + destination + "\nOpen Chaufr to accept or decline."))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        try {
            getSystemService(NotificationManager::class.java).notify(tripId.hashCode(), notification)
        } catch (_: SecurityException) {
            // Android notification permission is controlled by the driver.
        }
    }

    private fun stopLocationUpdates() {
        try { locationManager.removeUpdates(this) } catch (_: Exception) { }
    }

    override fun onDestroy() {
        offerPollingJob?.cancel()
        stopLocationUpdates()
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL_ID = "chaufr_driver_location"
        private const val OFFERS_CHANNEL_ID = "chaufr_driver_offers"
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
