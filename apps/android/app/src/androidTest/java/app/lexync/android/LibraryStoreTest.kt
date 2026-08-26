package app.lexync.android

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import java.util.UUID
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

class LibraryStoreTest {
    private lateinit var database: LexyncDatabase
    private lateinit var store: LibraryStore

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, LexyncDatabase::class.java).build()
        store = LibraryStore(database)
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun laterSnapshotAtomicallyReplacesRemovedVocabularyWithoutDuplicates() = runTest {
        store.replace(snapshot(listOf("caminar")), "learner@example.com")
        store.replace(snapshot(listOf("caminar", "andar")), "learner@example.com")
        store.replace(snapshot(listOf("caminar")), "learner@example.com")

        assertEquals(listOf("caminar"), store.load()?.studyPairs?.single()?.vocabularyEntries?.map { it.expression })
    }

    @Test
    fun failedReplacementPreservesTheLastCompleteLibrary() = runTest {
        store.replace(snapshot(listOf("caminar")), "learner@example.com")
        val duplicate = snapshot(listOf("andar", "andar"), duplicateEntryId = true)

        assertThrows(Exception::class.java) {
            kotlinx.coroutines.runBlocking {
                store.replace(duplicate, "learner@example.com")
            }
        }
        assertEquals(listOf("caminar"), store.load()?.studyPairs?.single()?.vocabularyEntries?.map { it.expression })
    }

    private fun snapshot(expressions: List<String>, duplicateEntryId: Boolean = false): AccountVocabularySnapshot {
        val duplicateId = UUID.fromString("22222222-2222-2222-2222-222222222222")
        return AccountVocabularySnapshot(
            schemaVersion = 1,
            learnerId = UUID.fromString("88888888-8888-8888-8888-888888888888"),
            studyPairs = listOf(
                StudyPair(
                    id = UUID.fromString("11111111-1111-1111-1111-111111111111"),
                    targetLanguageTag = "es",
                    referenceLanguageTag = "en",
                    isPrimary = true,
                    vocabularyEntries = expressions.map { expression ->
                        VocabularyEntry(
                            id = if (duplicateEntryId) duplicateId else UUID.nameUUIDFromBytes(expression.toByteArray()),
                            expression = expression,
                            suspended = false,
                            senses = emptyList(),
                        )
                    },
                ),
            ),
        )
    }
}
