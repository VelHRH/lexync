package app.lexync.android

import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SnapshotValidatorTest {
    @Test
    fun acceptsTheSupportedCompleteSnapshot() {
        val snapshot = fixtureSnapshot()

        assertEquals(snapshot, SnapshotValidator.validate(snapshot))
    }

    @Test
    fun rejectsAnUnsupportedSnapshotBeforePersistence() {
        val snapshot = fixtureSnapshot().copy(schemaVersion = 2)

        assertThrows(InvalidSnapshotException::class.java) {
            SnapshotValidator.validate(snapshot)
        }
    }

    @Test
    fun rejectsDuplicateIdentifiersBeforePersistence() {
        val entry = fixtureSnapshot().studyPairs.single().vocabularyEntries.single()
        val pair = fixtureSnapshot().studyPairs.single().copy(vocabularyEntries = listOf(entry, entry))
        val snapshot = fixtureSnapshot().copy(studyPairs = listOf(pair))

        assertThrows(InvalidSnapshotException::class.java) {
            SnapshotValidator.validate(snapshot)
        }
    }

    private fun fixtureSnapshot(): AccountVocabularySnapshot {
        return AccountVocabularySnapshot(
            schemaVersion = 1,
            learnerId = UUID.fromString("88888888-8888-8888-8888-888888888888"),
            studyPairs = listOf(
                StudyPair(
                    id = UUID.fromString("11111111-1111-1111-1111-111111111111"),
                    targetLanguageTag = "es",
                    referenceLanguageTag = "en",
                    isPrimary = true,
                    vocabularyEntries = listOf(
                        VocabularyEntry(
                            id = UUID.fromString("22222222-2222-2222-2222-222222222222"),
                            expression = "caminar",
                            suspended = false,
                            senses = emptyList(),
                        ),
                    ),
                ),
            ),
        )
    }
}
