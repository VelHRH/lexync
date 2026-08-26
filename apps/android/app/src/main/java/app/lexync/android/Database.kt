package app.lexync.android

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.withTransaction
import java.util.UUID

@Entity(tableName = "accounts")
data class AccountEntity(@PrimaryKey val learnerId: String, val email: String)

@Entity(tableName = "study_pairs")
data class StudyPairEntity(
    @PrimaryKey val id: String,
    val learnerId: String,
    val targetLanguageTag: String,
    val referenceLanguageTag: String,
    val isPrimary: Boolean,
    val position: Int,
)

@Entity(tableName = "vocabulary_entries")
data class VocabularyEntryEntity(
    @PrimaryKey val id: String,
    val studyPairId: String,
    val expression: String,
    val suspended: Boolean,
    val position: Int,
)

@Entity(tableName = "senses")
data class SenseEntity(@PrimaryKey val id: String, val vocabularyEntryId: String, val position: Int)

@Entity(tableName = "translations")
data class TranslationEntity(@PrimaryKey val id: String, val senseId: String, val text: String, val position: Int)

@Entity(tableName = "examples")
data class ExampleEntity(@PrimaryKey val id: String, val senseId: String, val text: String, val position: Int)

@Dao
interface LibraryDao {
    @Insert suspend fun insertAccount(entity: AccountEntity)
    @Insert suspend fun insertStudyPairs(entities: List<StudyPairEntity>)
    @Insert suspend fun insertVocabularyEntries(entities: List<VocabularyEntryEntity>)
    @Insert suspend fun insertSenses(entities: List<SenseEntity>)
    @Insert suspend fun insertTranslations(entities: List<TranslationEntity>)
    @Insert suspend fun insertExamples(entities: List<ExampleEntity>)
    @Query("SELECT * FROM accounts LIMIT 1") suspend fun account(): AccountEntity?
    @Query("SELECT * FROM study_pairs ORDER BY position") suspend fun studyPairs(): List<StudyPairEntity>
    @Query("SELECT * FROM vocabulary_entries ORDER BY position") suspend fun vocabularyEntries(): List<VocabularyEntryEntity>
    @Query("SELECT * FROM senses ORDER BY position") suspend fun senses(): List<SenseEntity>
    @Query("SELECT * FROM translations ORDER BY position") suspend fun translations(): List<TranslationEntity>
    @Query("SELECT * FROM examples ORDER BY position") suspend fun examples(): List<ExampleEntity>
    @Query("DELETE FROM examples") suspend fun deleteExamples()
    @Query("DELETE FROM translations") suspend fun deleteTranslations()
    @Query("DELETE FROM senses") suspend fun deleteSenses()
    @Query("DELETE FROM vocabulary_entries") suspend fun deleteVocabularyEntries()
    @Query("DELETE FROM study_pairs") suspend fun deleteStudyPairs()
    @Query("DELETE FROM accounts") suspend fun deleteAccounts()
}

@Database(
    entities = [AccountEntity::class, StudyPairEntity::class, VocabularyEntryEntity::class, SenseEntity::class, TranslationEntity::class, ExampleEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class LexyncDatabase : RoomDatabase() {
    abstract fun libraryDao(): LibraryDao

    companion object {
        @Volatile
        private var instance: LexyncDatabase? = null

        fun create(context: Context): LexyncDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context, LexyncDatabase::class.java, "lexync.db").build().also { instance = it }
        }
    }
}

class LibraryStore(private val database: LexyncDatabase) {
    private val dao = database.libraryDao()

    suspend fun replace(snapshot: AccountVocabularySnapshot, email: String) {
        SnapshotValidator.validate(snapshot)
        database.withTransaction {
            clear()
            dao.insertAccount(AccountEntity(snapshot.learnerId.toString(), email))
            dao.insertStudyPairs(snapshot.studyPairs.mapIndexed { index, pair ->
                StudyPairEntity(pair.id.toString(), snapshot.learnerId.toString(), pair.targetLanguageTag, pair.referenceLanguageTag, pair.isPrimary, index)
            })
            dao.insertVocabularyEntries(snapshot.studyPairs.flatMap { pair ->
                pair.vocabularyEntries.mapIndexed { index, entry -> VocabularyEntryEntity(entry.id.toString(), pair.id.toString(), entry.expression, entry.suspended, index) }
            })
            dao.insertSenses(snapshot.studyPairs.flatMap(StudyPair::vocabularyEntries).flatMap { entry ->
                entry.senses.mapIndexed { index, sense -> SenseEntity(sense.id.toString(), entry.id.toString(), index) }
            })
            dao.insertTranslations(snapshot.studyPairs.flatMap(StudyPair::vocabularyEntries).flatMap(VocabularyEntry::senses).flatMap { sense ->
                sense.translations.mapIndexed { index, translation -> TranslationEntity(translation.id.toString(), sense.id.toString(), translation.text, index) }
            })
            dao.insertExamples(snapshot.studyPairs.flatMap(StudyPair::vocabularyEntries).flatMap(VocabularyEntry::senses).flatMap { sense ->
                sense.examples.mapIndexed { index, example -> ExampleEntity(example.id.toString(), sense.id.toString(), example.text, index) }
            })
        }
    }

    suspend fun load(): StoredLibrary? {
        val account = dao.account() ?: return null
        val entries = dao.vocabularyEntries()
        val senses = dao.senses()
        val translations = dao.translations()
        val examples = dao.examples()
        return StoredLibrary(
            account.email,
            UUID.fromString(account.learnerId),
            dao.studyPairs().map { pair ->
                StudyPair(
                    UUID.fromString(pair.id),
                    pair.targetLanguageTag,
                    pair.referenceLanguageTag,
                    pair.isPrimary,
                    entries.filter { it.studyPairId == pair.id }.map { entry ->
                        VocabularyEntry(
                            UUID.fromString(entry.id),
                            entry.expression,
                            entry.suspended,
                            senses.filter { it.vocabularyEntryId == entry.id }.map { sense ->
                                Sense(
                                    UUID.fromString(sense.id),
                                    translations.filter { it.senseId == sense.id }.map { Translation(UUID.fromString(it.id), it.text) },
                                    examples.filter { it.senseId == sense.id }.map { Example(UUID.fromString(it.id), it.text) },
                                )
                            },
                        )
                    },
                )
            },
        )
    }

    suspend fun clear() {
        dao.deleteExamples()
        dao.deleteTranslations()
        dao.deleteSenses()
        dao.deleteVocabularyEntries()
        dao.deleteStudyPairs()
        dao.deleteAccounts()
    }
}
