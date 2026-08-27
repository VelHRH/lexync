import org.gradle.api.DefaultTask
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction
import java.util.Base64

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.kapt")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val supabaseUrl = providers.gradleProperty("lexync.supabase.url").orElse(providers.environmentVariable("LEXYNC_SUPABASE_URL")).orElse("")
val supabasePublishableKey = providers.gradleProperty("lexync.supabase.publishableKey").orElse(providers.environmentVariable("LEXYNC_SUPABASE_PUBLISHABLE_KEY")).orElse("")

android {
    namespace = "app.lexync.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.lexync.android"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "SUPABASE_URL", "\"${supabaseUrl.get()}\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"${supabasePublishableKey.get()}\"")
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(platform("io.github.jan-tennert.supabase:bom:3.2.3"))
    implementation("io.github.jan-tennert.supabase:auth-kt")
    implementation("io.github.jan-tennert.supabase:postgrest-kt")
    implementation("io.ktor:ktor-client-android:3.2.3")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.compose.material3:material3:1.4.0")
    implementation("androidx.compose.ui:ui:1.9.3")
    implementation("androidx.compose.ui:ui-tooling-preview:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.room:room-runtime:2.8.4")
    implementation("androidx.room:room-ktx:2.8.4")
    kapt("androidx.room:room-compiler:2.8.4")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")

    androidTestImplementation("androidx.activity:activity-compose:1.11.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4:1.9.3")
    androidTestImplementation("androidx.room:room-testing:2.8.4")
    androidTestImplementation("androidx.test:core-ktx:1.7.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("junit:junit:4.13.2")
    androidTestImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    debugImplementation("androidx.compose.ui:ui-test-manifest:1.9.3")
    debugImplementation("androidx.compose.ui:ui-tooling:1.9.3")
}

abstract class ValidateClientCredential : DefaultTask() {
    @get:Input
    abstract val publishableKey: Property<String>

    @TaskAction
    fun verify() {
        val key = publishableKey.get()
        val payload = key.split('.').getOrNull(1)?.let { encoded ->
            runCatching { String(Base64.getUrlDecoder().decode(encoded)) }.getOrNull()
        }
        check(!key.startsWith("sb_secret_") && payload?.contains(Regex("\"role\"\\s*:\\s*\"service_role\"")) != true) {
            "A server-side Supabase credential cannot be embedded in the Android application"
        }
    }
}

val validateClientCredential = tasks.register<ValidateClientCredential>("validateClientCredential") {
    publishableKey.set(supabasePublishableKey)
}

tasks.named("preBuild") {
    dependsOn(validateClientCredential)
}

tasks.register("verifyNoServiceSecrets") {
    dependsOn("assembleDebug")
    dependsOn(validateClientCredential)
}
