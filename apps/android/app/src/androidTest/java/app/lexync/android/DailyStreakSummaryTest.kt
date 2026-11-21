package app.lexync.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class DailyStreakSummaryTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun showsAStreakOfZeroAsNotYetToday() {
        show(DailyStreak(current = 0, extendedToday = false))

        compose.onNodeWithContentDescription("Daily Streak: 0 days, not yet today").assertIsDisplayed()
        compose.onNodeWithText("0 days", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("Not yet today", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun showsAnActiveStreakExtendedToday() {
        show(DailyStreak(current = 1, extendedToday = true))

        compose.onNodeWithContentDescription("Daily Streak: 1 day, extended today").assertIsDisplayed()
        compose.onNodeWithText("1 day", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("Extended today", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun showsAnActiveStreakNotYetExtendedToday() {
        show(DailyStreak(current = 6, extendedToday = false))

        compose.onNodeWithContentDescription("Daily Streak: 6 days, not yet today").assertIsDisplayed()
        compose.onNodeWithText("6 days", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("Not yet today", useUnmergedTree = true).assertIsDisplayed()
    }

    private fun show(streak: DailyStreak) {
        compose.setContent {
            MaterialTheme {
                DailyStreakSummary(streak)
            }
        }
    }
}
