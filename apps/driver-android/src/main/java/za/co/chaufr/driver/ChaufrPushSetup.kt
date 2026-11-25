package za.co.chaufr.driver

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

object ChaufrPushSetup {
    suspend fun register(context: Context, apiUrl: String, accessToken: String) {
        if (apiUrl.isBlank() || accessToken.isBlank()) return
        if (FirebaseApp.getApps(context).isEmpty()) {
            if (BuildConfig.FIREBASE_API_KEY.isBlank() ||
                BuildConfig.FIREBASE_APP_ID.isBlank() ||
                BuildConfig.FIREBASE_PROJECT_ID.isBlank() ||
                BuildConfig.FIREBASE_SENDER_ID.isBlank()) return
            val options = FirebaseOptions.Builder()
                .setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                .build()
            FirebaseApp.initializeApp(context, options)
        }
        if (FirebaseApp.getApps(context).isEmpty()) return
        val fcmToken = FirebaseMessaging.getInstance().token.await()
        ChaufrApi.registerPushDevice(apiUrl, accessToken, fcmToken, android.os.Build.MODEL)
    }
}
