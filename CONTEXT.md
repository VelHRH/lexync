# Lexync Domain Glossary

## Learner

A person who owns private learning material, language settings, and learning progress.

## Learning Language

A language variety the Learner is studying, identified by a BCP 47 language tag. It is the primary boundary for the Learner's vocabulary, Collections, and learning sessions.

## Active Learning Language

The one Learning Language currently selected by the Learner across Lexync. The selection is synchronized across web, extension, Android, and iOS and scopes the Learner's current library and learning actions. An intentional adapter capture in another Learning Language makes that language active across every client.

## Answer Language

A language variety the Learner uses to express the meaning of material in a Learning Language, identified by a BCP 47 language tag. A Learner may use multiple Answer Languages within one Learning Language.

## Language Pair

The derived relationship between one Learning Language and one Answer Language. It exists while at least one Sense in the Learning Language has a translation in the Answer Language. It is not a Learner-managed container for vocabulary or progress.

## Preferred Answer Language

The Answer Language used by the greatest number of translated Senses within one Learning Language. The most recently used Answer Language wins a tie. Lexync derives it automatically rather than asking the Learner to choose a primary Language Pair.

## Onboarding

The one-time setup through which a Learner creates their first Learning Language. It is complete while the Learner has at least one Learning Language.

## Expression

A word or phrase in a Learning Language. Capitalization, Unicode representation, and insignificant whitespace do not create separate Expressions. Linguistically distinct surface forms remain separate Expressions; Lexync does not normalize them to a lemma.

## Vocabulary Entry

A Learner's private record of an Expression within one Learning Language. It owns the Learner's Senses, Examples, Collection memberships, suspension state, and learning progress.

## Sense

A Learner-defined meaning of a Vocabulary Entry. Each Sense has one or more translations in one or more Answer Languages and has its own Examples and Cards.

## Translation

A Learner's expression of one Sense's meaning in exactly one Answer Language.

## Example

A sentence showing an Expression in context. An Example is private unless it is explicitly published in a later sharing workflow.

## Audio Clip

Optional private audio saved with learning material. A Vocabulary Entry has at most one pronunciation Audio Clip, and an Example has at most one sentence Audio Clip. Later captures do not add or replace audio that already exists, but the Learner may explicitly remove or replace it. Missing audio does not prevent saving or learning the material.

## Card

A review direction for one Sense and one Answer Language. Recognition presents the Learning Language and asks for that Answer Language; recall presents a translation in that Answer Language and asks for the Learning Language. Cards do not have schedules or due dates.

## Collection

A flat, Learner-owned grouping of Vocabulary Entries within one Learning Language. A Vocabulary Entry may belong to multiple Collections. Collections do not contain other Collections.

## Learning Mode

An extension mode enabled by the Learner for a website. It exposes saved Expressions and offers capture actions for unsaved words and selected phrases.

## Review

Learner-initiated practice of Cards. A Review Session belongs to exactly one Learning Language, may mix Answer Languages, and contains a Sense at most once. Review prioritizes less-practiced Senses and randomizes among equally practiced Senses. A Learner may complete any number of Review Sessions. Review does not use spaced-repetition schedules or due dates.

## Review Session

A persisted, resumable sequence of Review questions for one Learning Language. Its question count, Senses, directions, order, question content, and answer choices are fixed as a snapshot when the session is created and remain stable across vocabulary edits, page reloads, browser tabs, and devices. Each question uses one Translation of its Sense, may use any Answer Language, contains at most one answer choice from any Sense, and excludes every other Sense of the prompted Vocabulary Entry. Deleted Senses and suspended Vocabulary Entries are removed from its unanswered questions. Deleting a Vocabulary Entry deletes its Review Attempts; suspending it preserves recorded attempts. A Learning Language has at most one active Review Session; leaving Review pauses that session until the Learner resumes and completes it.

## Review Attempt

A Learner's recorded answer to one question in a Review Session. It identifies the Sense and review direction and records when the answer was submitted and whether it was correct.

## Suspended Vocabulary Entry

A Vocabulary Entry retained as known learning material but excluded from Review until resumed.
