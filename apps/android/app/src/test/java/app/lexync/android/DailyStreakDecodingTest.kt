package app.lexync.android

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class DailyStreakDecodingTest {
    @Test
    fun decodesTheDailyStreakContract() {
        val streak = Json { ignoreUnknownKeys = true }.decodeFromString<DailyStreak>(
            """{"current": 4, "longest": 9, "extended_today": true}""",
        )

        assertEquals(DailyStreak(current = 4, extendedToday = true), streak)
    }
}
