# ADR 0005: The Dynamic Lesson composer is the product's front door, and Lessons become addressable

## Status

Accepted on 2026-10-03. Extends ADR 0003 without superseding it.

## Context

Two problems arrived together.

The authenticated product wrapped every surface in a white rounded sheet (`.app-content`), and most surfaces then placed a second bordered block inside it. The result was a card inside a card, which `DESIGN.md` already forbids in its own words — "one edge deep, a bordered box inside a bordered box is always wrong" — and which the owner judged to look unfinished.

Separately, the product's navigation did not reflect what the product is for. The Dynamic Lesson — describe what you want to practise, and Lexync builds a Lesson from your own reading — is the main value, but it was one item in a rail called "Home", visually indistinguishable from the vocabulary surfaces. Meanwhile `/lesson-history` was reachable only through a link buried inside another surface, and the Lessons page called the vocabulary flow "Scheduled practice", a name left over from the scheduling model ADR 0002 removed.

A third constraint shaped the solution. ADR 0003 established one runner for both question sources and at most one active Lesson per Learning Language. A Lesson could only be opened through `lesson_overview(p_learning_language_id)`, which returns that single active Lesson. Nothing in the database could address a Lesson by its own identity, so no Lesson could be linked to, returned to, or re-read after completion.

## Decision

The Dynamic Lesson composer is the front door. `/` renders it for a signed-in Learner, in place and without a redirect, so a bookmark to the site lands directly on it with no flash. Its canonical path is `/lessons/dynamic`, and the two render the same surface. No `/home` path is introduced; a third name for one screen would help no one.

`/lessons` becomes a hub of three tiles — Dynamic Lesson, Vocabulary Lesson, History — and each tile carries its own availability: the ready Sense count, the reason a Lesson cannot start, or "Resume lesson" when one is in progress. A Learner sees whether a surface can be entered before entering it, which matters because the surfaces behind two of those tiles have no chrome to escape from. The sub-surfaces themselves carry no sub-navigation; each is a different kind of thing, and a shared switcher would imply they are peers.

Lessons become addressable. A new `lesson_by_id(p_lesson_id)` returns the owner's Lesson by its own identity, active or completed, and the runner moves to `/lessons/:id` for both sources. `/lessons/vocabulary` stops being a page and becomes an action that starts or resumes the vocabulary Lesson and lands on its address. A completed Dynamic Lesson stays openable afterwards, read-only, which is what makes the "return to what you asked for" behavior real rather than decorative.

The rule that a Learning Language has at most one active Lesson is untouched. Addressability is additive: it changes what can be opened, not what can be active.

The shell loses its white sheet, and then loses its header too. A single full-height sidebar carries the brand, the task destinations, the active Learning Language, and the profile entry, and it collapses to a narrow rail of two-letter tags. It is glass floating on one continuous gradient; everything to its right is content, which sits directly on that gradient at one shared measure. A white card is reserved for blocks that are genuinely an entity — a vocabulary entry, a material row, a collection — never for a wrapper. The `.panel` pattern, a bordered block with a tinted header strip, is retired.

The UI adopts the glossary's names. "Scheduled practice" becomes "Vocabulary Lesson". `Practice Request` enters `CONTEXT.md`, because the composer makes it a first-class thing the Learner authors.

## Consequences

`/lesson` and `/lesson-history` are removed outright rather than redirected. Nothing outside the web app referenced them — not the extension, not Android — and the owner chose the clean break.

The runner's URL shape reserves `dynamic`, `vocabulary`, and `history` as path segments under `/lessons`. Lesson identifiers are UUIDs, so no collision is possible, and Next.js resolves a static segment before a dynamic one.

Every test that entered a Lesson through a "Start lesson" link, asserted the URL `/lesson`, or checked for a heading named "Home" had to change. The heading on the front door is now visually hidden, present for assistive technology but absent from the visual design, because a page title above a centered composer is noise.

Opening a Lesson by id widens what an authenticated Learner can read: previously only their one active Lesson was reachable, now any Lesson they own is. `lesson_by_id` is `security definer` and filters by `auth.uid()` before returning anything, and returns null rather than raising for a Lesson that is not theirs, so the surface does not leak the existence of other Learners' Lessons.
