# ADR 0001: Learning Language is the vocabulary boundary

## Status

Accepted on 2026-09-01.

## Context

Lexync originally organized a Learner's vocabulary, Collections, capture, and review progress inside a user-managed Study Pair made from one Target Language and one Reference Language. That model duplicates the same Learning Language material when a Learner uses more than one language to understand it. It also makes onboarding and navigation revolve around a setting that usually follows from the translations the Learner has already created.

The product must support one Sense with translations in multiple Answer Languages, such as Spanish `casa` translated as both English `house` and Ukrainian `дім`. Review sessions may ask for either Answer Language, but material from different Learning Languages must never appear in the same session.

The existing Study Pair schema and the recognition scheduling delivered by PR #78 contain valid Learner data and review history. Migration must preserve it.

## Decision

Learning Language is the durable ownership and session boundary. A Vocabulary Entry belongs to exactly one Learner and one Learning Language. Collections and learning sessions also belong to one Learning Language.

A Translation belongs to one Sense and declares exactly one Answer Language. A Sense may have Translations in multiple Answer Languages. A Language Pair is derived from the presence of translations for a Learning Language and Answer Language; it is not stored as a Learner-managed vocabulary container.

Lexync derives the Preferred Answer Language for each Learning Language from the Answer Language used by the greatest number of translated Senses. The most recently used Answer Language wins a tie. The preference is a UI default, not an ownership boundary.

Each Card is scheduled independently for one Sense, one Answer Language, and one direction. A Scheduled Review belongs to one Learning Language and may mix Answer Languages. A Scheduled Review never mixes Learning Languages.

The Active Learning Language is an account-wide synchronized setting shared by web, extension, Android, and future iOS clients. An intentional adapter capture in another Learning Language switches the account-wide selection and announces the change.

Onboarding asks only for a Learning Language. Adapters provide Answer Language when known. Other capture flows detect it when confidence is sufficient; otherwise they show an editable language choice that the Learner must confirm, preselected from the Preferred Answer Language when available.

Migration uses an expand-and-contract rollout. Existing Study Pairs remain readable while the new representation is introduced and clients migrate. Duplicate Expressions are consolidated within a Learning Language, while existing Senses remain separate unless equivalence can be proven. Translations, Examples, Collection memberships, audio, suspension state, Cards, review events, and schedules are retained. No Learner data is deleted.

## Consequences

- The same Expression is no longer duplicated solely because its translations use different Answer Languages.
- A Learner can keep `casa → house` and `casa → дім` in one Sense.
- Review scheduling distinguishes Answer Languages without splitting the Learning Language library.
- Client navigation becomes simpler because Learning Language replaces Study Pair as the persistent selector.
- Cross-client synchronization must include Active Learning Language and Answer Language metadata.
- Existing Study Pair APIs and columns require a compatibility period and a later contraction ticket.
- PR #78 remains valid historical work; its scheduled recognition data is migrated into the new Card identity rather than reverted.
