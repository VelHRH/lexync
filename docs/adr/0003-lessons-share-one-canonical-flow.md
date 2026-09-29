# ADR 0003: Lessons share one canonical flow regardless of question source

## Status

Accepted on 2026-09-24. Supersedes the Review terminology in ADR 0002 while preserving its persisted snapshot, correctness, ownership, and unscheduled practice decisions.

## Context

Lexync currently creates persisted practice sessions from a Learner's Vocabulary. Dynamic Lessons must instead generate questions on demand from the Learner's private Learning Materials, while keeping the same question experience, progress, pause, resume, completion, and history behavior.

Maintaining separate practice models for vocabulary-selected and generated questions would duplicate session state and allow the two flows to diverge. Keeping the existing Review terminology alongside Lesson and Dynamic Lesson would also give the same product concept multiple canonical names.

## Decision

Lesson is the canonical name for the persisted practice model across the domain, database, APIs, and user interface. Existing Review Sessions, Review Questions, and Review Attempts become Lessons, Lesson Questions, and Lesson Attempts.

A Lesson snapshots its question source, questions, order, prompts, choices, correct answers, submitted answers, and completion state. Questions may be selected from the Learner's Vocabulary or generated for a Dynamic Lesson. Both sources use the same question types and the same progression, answer, pause, resume, completion, and history flow.

A Learning Language has at most one active Lesson for a Learner regardless of question source. A Dynamic Lesson and its Learning Materials belong to exactly one Learning Language and never use material from another Learning Language.

Dynamic Lesson retrieval considers all ready Learning Materials in its Learning Language. A Dynamic Lesson is created only when enough relevant material satisfies the configured relevance policy. Otherwise no Lesson is created and the Learner is asked to change the Practice Request or Learning Materials.

## Consequences

- Existing Review data and behavior require an expand-and-contract migration to the Lesson terminology without losing active or completed practice history.
- Vocabulary and Dynamic Lessons cannot be active concurrently within one Learning Language.
- Dynamic generation extends the existing Lesson creation boundary rather than introducing a second lesson runner.
- Generated questions remain stable after creation even if Learning Materials later change or are removed.
- Vocabulary capture from a Dynamic Lesson reuses the existing Vocabulary workflow and requires Learner confirmation.
- The first Dynamic Lesson delivery is web-only; Android and extension behavior remain unchanged.
