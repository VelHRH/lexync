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

A separately scheduled review direction for one Sense and one Answer Language. Recognition presents the Learning Language and asks for that Answer Language; recall presents a translation in that Answer Language and asks for the Learning Language.

## Collection

A flat, Learner-owned grouping of Vocabulary Entries within one Learning Language. A Vocabulary Entry may belong to multiple Collections. Collections do not contain other Collections.

## Learning Mode

An extension mode enabled by the Learner for a website. It exposes saved Expressions and offers capture actions for unsaved words and selected phrases.

## Scheduled Review

Practice of Cards currently due under the Learner's spaced-repetition schedule. A session belongs to exactly one Learning Language, may mix Answer Languages, and never mixes Learning Languages. Its results update future scheduling.

## Free Practice

Learner-initiated practice for a Collection within one Learning Language. Its results do not change spaced-repetition schedules.

## Suspended Vocabulary Entry

A Vocabulary Entry retained as known learning material but excluded from Scheduled Reviews until resumed.
