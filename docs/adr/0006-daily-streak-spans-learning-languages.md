# ADR 0006: The Daily Streak spans Learning Languages and is derived from durable Active Days

## Status

Accepted on 2026-11-15.

## Context

Lexync needs a habit signal: practising on consecutive days should be visible and should feel earned. The owner also intends to reward streak milestones later, for example a week of free Premium for a 25-day streak, but Premium does not exist yet, so the reward system's shape is unknown.

ADR 0001 makes the Learning Language the boundary for vocabulary, Collections, and Lessons. A habit, though, belongs to the person rather than to a language, and an account-level reward cannot sensibly be split across languages.

The glossary already uses "Practice Streak" for a Sense's run of correct Lesson Attempts, so the new concept needs a distinct name.

## Decision

The Daily Streak belongs to the Learner and spans every Learning Language. It is a deliberate exception to ADR 0001.

Completing a Lesson of either source, of any length and any score, makes its local calendar date an Active Day. Starting, answering, or discarding a Lesson does not. The local date comes from the Learner Timezone reported by the client and is stamped at completion; changing the timezone later never moves an existing Active Day.

The streak is strict: a whole local day without an Active Day returns it to zero. It keeps its count through the current day when yesterday was an Active Day, and surfaces distinguish "extended today" from "not yet today". The Longest Daily Streak is kept alongside it.

Existing completed Lessons are backfilled into Active Days using the first Learner Timezone each Learner reports.

Active Days are the stored fact. No milestone, reward, grace day, or streak freeze model is introduced now. A future reward system derives the milestones a Learner reached from Active Days, retroactively if it chooses.

The first release shows the Daily Streak on web and Android, with a moment on Lesson completion when the streak is extended. The extension and reminders are out of scope.

## Consequences

Learners need a stored timezone, which they have never had. Until a client reports one, a Learner's completions cannot be assigned a reliable local date.

Backfilled days near midnight may be off by one, because historical completions predate any reported timezone. This is accepted.

Travelling east can shorten a local day and travelling west can lengthen one; because Active Days are never recomputed, history stays stable at the cost of that edge.

Because Active Days are never pruned, any future milestone or reward rule can be evaluated against the full history without a migration of past data.
