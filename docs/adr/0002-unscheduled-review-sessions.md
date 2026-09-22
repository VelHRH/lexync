# ADR 0002: Unscheduled Review Sessions are the canonical Review model

## Status

Accepted on 2026-09-19. Contracted on 2026-09-22 in issue #104. Supersedes the independent Card scheduling decision in ADR 0001 while preserving its Learning Language boundary and multilingual Review decisions.

## Context

ADR 0001 established Learning Language as the durable ownership and session boundary. A Sense may have Translations in multiple Answer Languages, and a Review Session may use any Answer Language while never mixing Learning Languages. Those boundaries remain valid.

The first Review implementation scheduled independent Cards and appended rating-based review events. That history is valid Learner data, but Card scheduling is not the canonical model for the new Review experience. A session must instead preserve the exact question shown to a Learner across reloads, navigation, restarts, devices, and later vocabulary edits. The contract phase must remove active schedule, due-date, retention, and rating state without fabricating correctness for historical participation.

## Decision

Review Sessions are Learner-owned, additive records scoped to one Learning Language. Each session snapshots its questions, Sense, question type, direction, prompts, choices, Answer Language, and correct answer. Review Attempts retain the practiced Sense and snapshot the question type, direction, first submitted answer, and timestamp. A session has at most one active instance for a Learner and Learning Language, and a one-question session completes exactly once.

The minimal Review question is deterministic recognition translation: its prompt is an Expression and its choices are distinct Translation text snapshots. The reviewed Sense's chosen Translation is the correct answer. The session remains scoped to one Learning Language and may use any Answer Language. Eligibility requires at least two active distinct Senses with at least two distinct Translation choices.

Submission determines correctness from the persisted correct-answer snapshot and selected choice. Ratings are not used to infer correctness. Retried or concurrent submissions return the first durable Attempt and completed Session without changing its answer, timestamp, counts, or status.

Legacy Card ownership, review timestamps, relationships, and compatibility APIs remain queryable as historical participation evidence where required. Contraction removes active schedule, due-date, retention, and rating state from those contracts, retaining timestamps without fabricated correctness. The canonical Review path does not backfill Review Sessions or Attempts from history, alter legacy participation, or create future schedules.

## Consequences

- Learning Language remains the ownership and Review boundary, including the no-mixed-Language invariant from ADR 0001.
- One Sense can continue to support Translations in multiple Answer Languages, and a session can select any of them.
- Session snapshots make the Learner's in-progress and completed result durable across clients and vocabulary changes. Deleting a Vocabulary Entry cascades its associated question and Attempt details, while suspending it preserves recorded Attempts.
- Review correctness is explicit and independent of legacy ratings and scheduling state.
- Legacy Card ownership and review timestamps remain available as participation evidence; ratings, correctness, retention, due dates, and future schedules are not active state.
- The later Review roadmap may add queue sizing, randomization, prioritization, direction alternation, and other policies without changing snapshot or ownership guarantees.
