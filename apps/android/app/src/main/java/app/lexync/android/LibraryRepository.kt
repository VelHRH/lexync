package app.lexync.android

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc

class LibraryRepository(private val client: SupabaseClient) {
    suspend fun signIn(email: String, password: String) {
        client.auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }

    suspend fun snapshot(): AccountVocabularySnapshot = client.postgrest.rpc("account_vocabulary_snapshot").decodeAs()

    suspend fun close() = client.close()

    companion object {
        fun create(): LibraryRepository {
            require(BuildConfig.SUPABASE_URL.isNotBlank()) { "Supabase URL is not configured" }
            require(BuildConfig.SUPABASE_PUBLISHABLE_KEY.isNotBlank()) { "Supabase publishable key is not configured" }
            return LibraryRepository(createSupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_PUBLISHABLE_KEY) {
                install(Auth)
                install(Postgrest)
            })
        }
    }
}
