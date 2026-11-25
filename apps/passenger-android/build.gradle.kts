plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
}
android {
  namespace = "za.co.chaufr.passenger"
  compileSdk = 35
  defaultConfig {
    applicationId = "za.co.chaufr.passenger"
    minSdk = 26
    targetSdk = 35
    versionCode = 1
    versionName = "0.1.0"
    buildConfigField("String", "CHAUFR_API_BASE_URL", "\"${providers.gradleProperty("chaufrApiBaseUrl").orNull ?: ""}\"")
    buildConfigField("String", "FIREBASE_API_KEY", "\"${providers.gradleProperty("firebaseApiKey").orNull ?: ""}\"")
    buildConfigField("String", "FIREBASE_APP_ID", "\"${providers.gradleProperty("firebaseAppId").orNull ?: ""}\"")
    buildConfigField("String", "FIREBASE_PROJECT_ID", "\"${providers.gradleProperty("firebaseProjectId").orNull ?: ""}\"")
    buildConfigField("String", "FIREBASE_SENDER_ID", "\"${providers.gradleProperty("firebaseSenderId").orNull ?: ""}\"")
    val mapsKey = providers.gradleProperty("chaufrGoogleMapsApiKey").orNull ?: ""
    manifestPlaceholders["MAPS_API_KEY"] = mapsKey
    buildConfigField("String", "GOOGLE_MAPS_API_KEY", "\"$mapsKey\"")
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions { jvmTarget = "17" }
  buildFeatures {
    compose = true
    buildConfig = true
  }
}
dependencies {
  implementation(platform("androidx.compose:compose-bom:2024.12.01"))
  implementation("androidx.activity:activity-compose:1.10.0")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.ui:ui-tooling-preview")
  implementation("androidx.compose.material3:material3")
  implementation("com.google.maps.android:maps-compose:6.4.1")
  implementation("com.google.android.libraries.places:places:3.5.0")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
  implementation("com.google.firebase:firebase-messaging:24.1.0")
  debugImplementation("androidx.compose.ui:ui-tooling")
}
