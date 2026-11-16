package app.lexync.android

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

private val EmberReadable = Color(0xFF9D4A22)
private val EmberSoft = Color(0xFFF6DDCB)

fun streakDays(count: Int): String = "$count ${if (count == 1) "day" else "days"}"

fun dailyStreakDescription(streak: DailyStreak): String =
    "Daily Streak: ${streakDays(streak.current)}, ${if (streak.extendedToday) "extended today" else "not yet today"}"

@Composable
fun DailyStreakSummary(streak: DailyStreak, modifier: Modifier = Modifier) {
    val extended = streak.extendedToday
    val description = dailyStreakDescription(streak)
    val container by animateColorAsState(if (extended) EmberSoft else Color.Transparent, tween(200), label = "dailyStreakContainer")
    val accent by animateColorAsState(if (extended) EmberReadable else MaterialTheme.colorScheme.onSurfaceVariant, tween(200), label = "dailyStreakAccent")
    Surface(
        modifier = modifier.semantics(mergeDescendants = true) { contentDescription = description },
        shape = RoundedCornerShape(16.dp),
        color = container,
    ) {
        Row(
            modifier = Modifier.defaultMinSize(minHeight = 48.dp).padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            val flame = remember(accent, extended) { streakFlame(accent, if (extended) accent else Color.Transparent, if (extended) EmberSoft else Color.Transparent) }
            Image(rememberVectorPainter(flame), contentDescription = null, modifier = Modifier.size(20.dp))
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(streakDays(streak.current), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    if (extended) "Extended today" else "Not yet today",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = if (extended) FontWeight.Bold else null,
                    color = accent,
                )
            }
        }
    }
}

private fun streakFlame(stroke: Color, fill: Color, core: Color): ImageVector = ImageVector.Builder(
    name = "StreakFlame",
    defaultWidth = 20.dp,
    defaultHeight = 20.dp,
    viewportWidth = 24f,
    viewportHeight = 24f,
).addPath(
    pathData = PathParser().parsePathString("M12 2.5c.8 2.9 3.6 4.7 4.9 7.4.7 1.4 1.1 2.9 1.1 4.3a6 6 0 0 1-12 0c0-2.4 1-4.3 2.6-5.8.1 1.6.8 2.8 2 3.4-.4-3.6.3-6.6 1.4-9.3Z").toNodes(),
    fill = SolidColor(fill),
    stroke = SolidColor(stroke),
    strokeLineWidth = 1.6f,
    strokeLineJoin = StrokeJoin.Round,
).addPath(
    pathData = PathParser().parsePathString("M12 13.2c.9 1.1 2 2 2 3.5a2 2 0 0 1-4 0c0-1.3.9-2.3 2-3.5Z").toNodes(),
    fill = SolidColor(core),
    stroke = SolidColor(stroke),
    strokeLineWidth = 1.4f,
    strokeLineJoin = StrokeJoin.Round,
).build()
