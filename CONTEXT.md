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

A practice direction for one Sense and one Answer Language. Recognition presents the Learning Language and asks for that Answer Language; recall presents a translation in that Answer Language and asks for the Learning Language. Cards do not have schedules or due dates.

## Collection

A flat, Learner-owned grouping of Vocabulary Entries within one Learning Language. A Vocabulary Entry may belong to multiple Collections. Collections do not contain other Collections.

## Lesson

A Learner-owned, persisted learning activity for exactly one Learning Language. Its source is `vocabulary` or `dynamic`; its questions and progress form a durable snapshot that can be resumed and completed. A Learner has at most one active Lesson per Learning Language across both sources.

## Vocabulary Lesson

A Lesson whose source is `vocabulary`, using the Learner's vocabulary material and its Senses for practice.

## Dynamic Lesson

A Lesson whose source is `dynamic`, using generated or contextual material for practice. Its questions may have no Vocabulary Entry or Sense.

## Lesson Question

A persisted question in a Lesson whose content, choices, answer, direction, and relevant language metadata are part of the Lesson snapshot. Translation questions retain their Sense and translation metadata; cloze questions retain their Vocabulary Entry and cloze metadata. Dynamic questions may have null Vocabulary Entry and Sense references.

## Lesson Attempt

A Learner's durable recorded answer to one Lesson Question, including the submitted answer, correctness, and submission time.

## Learning Mode

An extension mode enabled by the Learner for a website. It exposes saved Expressions and offers capture actions for unsaved words and selected phrases.

## Historical Review Participation

Review participation describes legacy Card-based practice records that may remain in historical data. It is not the canonical model for current practice; current practice uses Lesson, Lesson Question, and Lesson Attempt.

## Suspended Vocabulary Entry

A Vocabulary Entry retained as known learning material but excluded from a Lesson until resumed.
