package app.lexync.android

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class SnapshotDecodingTest {
    @Test
    fun decodesTheCompleteAccountSnapshotContract() {
        val snapshot = Json.decodeFromString<AccountVocabularySnapshot>(
            """
            {
              "schemaVersion": 1,
              "learnerId": "88888888-8888-8888-8888-888888888888",
              "studyPairs": [{
                "id": "11111111-1111-1111-1111-111111111111",
                "targetLanguageTag": "es",
                "referenceLanguageTag": "en",
                "isPrimary": true,
                "vocabularyEntries": [{
                  "id": "22222222-2222-2222-2222-222222222222",
                  "expression": "caminar",
                  "suspended": false,
                  "senses": [{
                    "id": "33333333-3333-3333-3333-333333333333",
                    "translations": [{"id": "44444444-4444-4444-4444-444444444444", "text": "to walk"}],
                    "examples": [{"id": "55555555-5555-5555-5555-555555555555", "text": "Camino al trabajo cada mañana."}]
                  }]
                }]
              }]
            }
            """.trimIndent(),
        )

        val entry = snapshot.studyPairs.single().vocabularyEntries.single()
        assertEquals("caminar", entry.expression)
        assertEquals("to walk", entry.senses.single().translations.single().text)
        assertEquals("Camino al trabajo cada mañana.", entry.senses.single().examples.single().text)
    }
}
