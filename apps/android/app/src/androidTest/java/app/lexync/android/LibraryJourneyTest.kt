package app.lexync.android

import android.content.Context
import android.content.Intent
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import java.util.UUID
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalTestApi::class)
class LibraryJourneyTest {
    @get:Rule
    val compose = createEmptyComposeRule()

    private var scenario: ActivityScenario<MainActivity>? = null
    private val arguments by lazy { InstrumentationRegistry.getArguments() }
    private val email by lazy { requireNotNull(arguments.getString("lexyncTestEmail")) }
    private val password by lazy { requireNotNull(arguments.getString("lexyncTestPassword")) }

    @After
    fun closeActivity() {
        scenario?.close()
    }

    @Test
    fun signsInAndSynchronizesTheCompleteVocabularyGraph() {
        launch(resetLocalData = true)

        compose.onNodeWithText("Sign in with Apple").assertDoesNotExist()
        signIn()
        compose.waitUntilAtLeastOneExists(hasText("Synchronization complete"), 15_000)
        compose.onNodeWithText(email).assertIsDisplayed()
        compose.onNodeWithText("Spanish · English").assertIsDisplayed()
        compose.onNodeWithContentDescription("Open Vocabulary Entry caminar").performClick()
        compose.onNodeWithText("to walk").assertIsDisplayed()
        compose.onNodeWithText("to travel on foot").assertIsDisplayed()
        compose.onNodeWithText("Camino al trabajo cada mañana.").assertIsDisplayed()
    }

    @Test
    fun synchronizedVocabularySurvivesOfflineRelaunch() {
        launch(resetLocalData = true)
        signIn()
        compose.waitUntilAtLeastOneExists(hasText("Synchronization complete"), 15_000)
        scenario?.close()

        launch(disableNetwork = true)

        compose.waitUntilAtLeastOneExists(hasText("Offline library"), 10_000)
        compose.onNodeWithContentDescription("Open Vocabulary Entry caminar").assertIsDisplayed()
    }

    @Test
    fun restoredCredentialsCanSynchronizeAfterRelaunch() {
        launch(resetLocalData = true)
        signIn()
        compose.waitUntilAtLeastOneExists(hasText("Synchronization complete"), 15_000)
        scenario?.close()

        launch()
        compose.waitUntilAtLeastOneExists(hasText(email), 10_000)
        compose.onNodeWithText("Synchronize").performClick()

        compose.waitUntilAtLeastOneExists(hasText("Synchronization complete"), 15_000)
        compose.onNodeWithContentDescription("Open Vocabulary Entry caminar").assertIsDisplayed()
    }

    @Test
    fun laterSnapshotReplacesRemovedVocabularyWithoutDuplicates() = runBlocking {
        launch(resetLocalData = true)
        signIn()
        compose.waitUntilAtLeastOneExists(hasText("1 Vocabulary Entry"), 15_000)
        val client = createSupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_PUBLISHABLE_KEY) {
            install(Auth)
            install(Postgrest)
        }
        client.auth.signInWith(Email) {
            this.email = this@LibraryJourneyTest.email
            this.password = this@LibraryJourneyTest.password
        }
        val studyPair = client.from("study_pairs").select().decodeList<StudyPairId>().first()
        val expression = "snapshot-${UUID.randomUUID()}"
        val capture = client.postgrest.rpc(
            "capture_manual_entry",
            CaptureParameters(null, expression, studyPair.id, "snapshot test"),
        ).decodeSingle<CaptureResult>()

        try {
            compose.onNodeWithText("Synchronize").performClick()
            compose.waitUntilAtLeastOneExists(hasText(expression), 15_000)
            client.from("vocabulary_entries").delete {
                filter { eq("id", capture.vocabularyEntryId) }
            }
            compose.onNodeWithText("Synchronize").performClick()
            compose.waitUntil(15_000) {
                compose.onAllNodes(hasText(expression)).fetchSemanticsNodes().isEmpty()
            }
            compose.onNodeWithText(expression).assertDoesNotExist()
            compose.onNodeWithText("1 Vocabulary Entry").assertIsDisplayed()
            assertEquals(1, compose.onAllNodes(hasText("caminar")).fetchSemanticsNodes().size)
        } finally {
            client.from("vocabulary_entries").delete {
                filter { eq("id", capture.vocabularyEntryId) }
            }
            client.close()
        }
    }

    private fun launch(resetLocalData: Boolean = false, disableNetwork: Boolean = false) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val intent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(MainActivity.RESET_LOCAL_DATA, resetLocalData)
            putExtra(MainActivity.DISABLE_NETWORK, disableNetwork)
        }
        scenario = ActivityScenario.launch(intent)
    }

    private fun signIn() {
        compose.onNodeWithText("Email").performTextInput(email)
        compose.onNodeWithText("Password").performTextInput(password)
        compose.onNodeWithText("Sign In").performClick()
    }
}

@Serializable
private data class StudyPairId(val id: String)

@Serializable
private data class CaptureParameters(
    val p_example: String?,
    val p_expression: String,
    val p_study_pair_id: String,
    val p_translation: String,
)

@Serializable
private data class CaptureResult(
    @SerialName("vocabulary_entry_id") val vocabularyEntryId: String,
)
