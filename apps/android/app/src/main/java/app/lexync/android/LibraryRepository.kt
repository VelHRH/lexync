package app.lexync.android

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import java.util.Base64

class LibraryRepository(private val client: SupabaseClient) {
    suspend fun signIn(email: String, password: String) {
        client.auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }

    suspend fun snapshot(): AccountVocabularySnapshot {
        client.auth.awaitInitialization()
        requireNotNull(client.auth.currentSessionOrNull()) { "Sign in is required" }
        return client.postgrest.rpc("account_vocabulary_snapshot").decodeAs()
    }

    suspend fun close() = client.close()

    companion object {
        fun create(): LibraryRepository {
            require(BuildConfig.SUPABASE_URL.isNotBlank()) { "Supabase URL is not configured" }
            val publishableKey = ClientCredentialValidator.requirePublishableKey(BuildConfig.SUPABASE_PUBLISHABLE_KEY)
            return LibraryRepository(createSupabaseClient(BuildConfig.SUPABASE_URL, publishableKey) {
                install(Auth)
                install(Postgrest)
            })
        }
    }
}

object ClientCredentialValidator {
    fun requirePublishableKey(key: String): String {
        require(key.isNotBlank()) { "Supabase publishable key is not configured" }
        require(!key.startsWith("sb_secret_")) { "A browser-safe Supabase publishable key is required" }
        val payload = key.split('.').getOrNull(1)?.let { encoded ->
            runCatching { String(Base64.getUrlDecoder().decode(encoded)) }.getOrNull()
        }
        require(payload?.contains(Regex("\"role\"\\s*:\\s*\"service_role\"")) != true) {
            "A browser-safe Supabase publishable key is required"
        }
        return key
    }
}
