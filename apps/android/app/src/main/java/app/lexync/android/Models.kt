package app.lexync.android

import java.util.UUID
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

object UUIDSerializer : KSerializer<UUID> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("UUID", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: UUID) {
        encoder.encodeString(value.toString())
    }

    override fun deserialize(decoder: Decoder): UUID = UUID.fromString(decoder.decodeString())
}

@Serializable
data class AccountVocabularySnapshot(
    val schemaVersion: Int,
    @Serializable(with = UUIDSerializer::class) val learnerId: UUID,
    val studyPairs: List<StudyPair>,
)

@Serializable
data class StudyPair(
    @Serializable(with = UUIDSerializer::class) val id: UUID,
    val targetLanguageTag: String,
    val referenceLanguageTag: String,
    val isPrimary: Boolean,
    val vocabularyEntries: List<VocabularyEntry>,
)

@Serializable
data class VocabularyEntry(
    @Serializable(with = UUIDSerializer::class) val id: UUID,
    val expression: String,
    val suspended: Boolean,
    val senses: List<Sense>,
)

@Serializable
data class Sense(
    @Serializable(with = UUIDSerializer::class) val id: UUID,
    val translations: List<Translation>,
    val examples: List<Example>,
)

@Serializable
data class Translation(
    @Serializable(with = UUIDSerializer::class) val id: UUID,
    val text: String,
)

@Serializable
data class Example(
    @Serializable(with = UUIDSerializer::class) val id: UUID,
    val text: String,
)

data class StoredLibrary(
    val email: String,
    val learnerId: UUID,
    val studyPairs: List<StudyPair>,
)

fun AccountVocabularySnapshot.vocabularyEntries(): List<VocabularyEntry> = studyPairs.flatMap(StudyPair::vocabularyEntries)

fun AccountVocabularySnapshot.senses(): List<Sense> = vocabularyEntries().flatMap(VocabularyEntry::senses)

fun AccountVocabularySnapshot.translations(): List<Translation> = senses().flatMap(Sense::translations)

fun AccountVocabularySnapshot.examples(): List<Example> = senses().flatMap(Sense::examples)
