package app.lexync.android

import java.util.UUID

class InvalidSnapshotException(message: String) : IllegalArgumentException(message)

object SnapshotValidator {
    fun validate(snapshot: AccountVocabularySnapshot): AccountVocabularySnapshot {
        if (snapshot.schemaVersion != 1) {
            throw InvalidSnapshotException("Unsupported snapshot schema version")
        }
        requireUnique(snapshot.studyPairs.map(StudyPair::id), "Study Pair")
        requireUnique(snapshot.vocabularyEntries().map(VocabularyEntry::id), "Vocabulary Entry")
        requireUnique(snapshot.senses().map(Sense::id), "Sense")
        requireUnique(snapshot.translations().map(Translation::id), "Translation")
        requireUnique(snapshot.examples().map(Example::id), "Example")
        return snapshot
    }

    private fun requireUnique(ids: List<UUID>, entity: String) {
        if (ids.distinct().size != ids.size) {
            throw InvalidSnapshotException("Duplicate $entity identifier")
        }
    }
}
