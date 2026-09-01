# Lexync Product Specification

## Problem Statement

Lexync lets a Learner capture words and phrases while browsing, keep the resulting private vocabulary synchronized, and practise it across web and native clients. Its original Study Pair model makes the same Learning Language material into separate libraries whenever the Learner uses different Answer Languages. That division complicates onboarding, capture, navigation, Collections, and review, and prevents one Sense from naturally containing equivalent translations such as Spanish `casa`, English `house`, and Ukrainian `дім`.

The current web and extension interfaces also do not express the purple identity of the supplied Lexync logo, and supported lesson adapters do not retain available pronunciation or sentence audio. Product specifications and client tickets still encode the older model inconsistently across web, extension, Android, and future iOS work.

## Solution

Lexync organizes all private learning material by Learning Language. The Learner chooses a first Learning Language during onboarding and can add, remove, or switch Learning Languages later. The Active Learning Language is synchronized account-wide and is always visible in client navigation.

Translations declare their Answer Language inside a Sense. A Sense may contain multiple Answer Languages, while each corresponding recognition and recall Card retains an independent schedule. A session may mix Answer Languages but never Learning Languages. Language Pairs and the Preferred Answer Language are derived automatically from the Learner's translations rather than managed as primary product entities.

Capture adapters save available pronunciation and sentence audio into learner-private object storage on explicit Save. Audio is optional, never autoplays, and never blocks capture or practice. Existing material and PR #78 review history are migrated without deletion.

Web, extension, Android, and future iOS clients consume one semantic design contract based on the canonical `#6429f4` purple logo color, dark ink, white, and lavender neutrals. Web and extension are redesigned first in light mode using the project-pinned Impeccable and design-taste skills. Native clients use platform-appropriate adapters to the same semantics.

## User Stories

1. As a new Learner, I want onboarding to ask only which language I am learning, so that I can start without understanding Language Pairs.
2. As a Learner, I want to add another Learning Language in Settings, so that I can study more than one language.
3. As a Learner, I want to remove a Learning Language deliberately, so that its consequences are clear before any material is affected.
4. As a Learner, I want my Active Learning Language visible beside my profile, so that I always know which library and session I am using.
5. As a Learner, I want switching the Active Learning Language on one client to synchronize to the others, so that Lexync has one coherent current context.
6. As a Learner, I want a capture from a known course in another Learning Language to switch the active context visibly, so that the saved material and current UI agree.
7. As a Learner, I want sessions to contain only one Learning Language, so that unrelated languages never appear together.
8. As a multilingual Learner, I want one Sense to contain translations in multiple Answer Languages, so that equivalent meanings are not duplicated.
9. As a Learner, I want `casa → house` and `casa → дім` to coexist in one Sense, so that Spanish remains one library.
10. As a Learner, I want Language Pairs to appear automatically when translations exist, so that I do not manage redundant containers.
11. As a Learner, I want Lexync to infer my Preferred Answer Language from my vocabulary, so that common capture defaults remain convenient.
12. As a Learner, I want the most recently used Answer Language to resolve a usage-count tie, so that the default follows my current behavior.
13. As a Learner, I want each Translation to display its Answer Language when ambiguity matters, so that I know what a review expects.
14. As a Learner, I want adapters to provide known Learning and Answer Languages, so that supported lesson capture remains one click.
15. As a Learner, I want ordinary capture to detect Answer Language when reliable, so that common saves require no extra choice.
16. As a Learner, I want an editable Answer Language chip when detection is uncertain, so that incorrect metadata is never silently saved.
17. As a Learner, I want uncertain capture to preselect my Preferred Answer Language, so that confirmation is usually quick.
18. As a Learner, I want manual entry scoped to the Active Learning Language, so that the entry lands in the expected library.
19. As a Learner, I want repeated capture of an Expression to enrich the existing entry within its Learning Language, so that duplicates do not accumulate.
20. As a Learner, I want a new Answer Language added to the sole existing Sense automatically, so that simple entries remain one-click.
21. As a Learner, I want to choose a Sense or create one when an entry has multiple Senses, so that Lexync never invents semantic equivalence.
22. As a Learner, I want matching based on confirmed meaning rather than spelling alone, so that homonyms remain distinct.
23. As a Learner, I want Collections to group entries within one Learning Language, so that practice stays coherent.
24. As a Learner, I want an entry in multiple Collections without duplicating it, so that organization does not fragment progress.
25. As a Learner, I want recognition Cards scheduled per Sense and Answer Language, so that success in English does not falsely imply success in Ukrainian.
26. As a Learner, I want recall Cards scheduled per Sense and Answer Language, so that each expected response has independent progress.
27. As a Learner, I want one Scheduled Review to mix Answer Languages when their Cards are due, so that all due material for the Learning Language can be completed together.
28. As a Learner, I want the expected Answer Language clearly indicated during a mixed session, so that I know which response to provide.
29. As a Learner, I want Free Practice to stay inside its Collection and Learning Language, so that it never mixes unrelated study material.
30. As a Learner, I want review events to synchronize durably after offline practice, so that no progress is lost.
31. As a Learner, I want the recognition history created before this migration retained, so that the new model does not reset my progress.
32. As a Learner, I want available pronunciation audio saved with a Vocabulary Entry, so that I can hear the Expression later.
33. As a Learner, I want available sentence audio saved with an Example, so that I can hear the Expression in context.
34. As a Learner, I want adapter audio copied only when I explicitly save the item, so that browsing does not create unwanted storage.
35. As a Learner, I want saved audio stored privately under my account, so that other Learners cannot access it.
36. As a Learner, I want later captures to preserve audio I already have, so that an automatic save never overwrites my chosen clip.
37. As a Learner, I want to replace or remove audio explicitly, so that I control my private media.
38. As a Learner, I want audio to play only when I press Play, so that it never surprises me.
39. As a Learner, I want a clip cached after its first playback, so that I can replay it offline.
40. As a Learner, I want capture and practice to work when audio is absent or fails, so that optional media never blocks learning.
41. As a Learner, I want exports to include the new language structure, private audio, and review history, so that my account remains portable.
42. As a Learner, I want sign-out and account cleanup to remove local cached media, so that private data does not remain on a shared device.
43. As a Learner, I want the web and extension interfaces to feel like the purple Lexync logo, so that the product has one recognizable identity.
44. As a Learner, I want extension controls injected into lesson pages to use the same semantic identity, so that capture feels like Lexync.
45. As a Learner, I want platform-native Android and future iOS interfaces that share Lexync semantics, so that consistency does not erase native usability.
46. As a keyboard or assistive-technology user, I want every capture, navigation, playback, and review control to expose clear focus, names, states, and errors, so that I can complete the same workflows.
47. As a Learner with reduced-motion preferences, I want nonessential motion removed, so that the interface remains comfortable.
48. As a Learner, I want existing Expressions, Senses, translations, Examples, Collections, suspension state, and review history preserved through migration, so that this redesign costs me no data.
49. As a Learner, I want legacy duplicate Expressions consolidated conservatively, so that equivalent libraries join without unrelated Senses being merged.
50. As a future iOS Learner, I want the same language and synchronization contracts documented now, so that the paused client can rejoin without another domain redesign.

## Implementation Decisions

- BCP 47 tags identify Learning and Answer Languages. Language variants remain distinct.
- A Vocabulary Entry is unique by Learner, Learning Language, and normalized Expression identity. It owns Senses, Examples, Collection memberships, suspension state, optional pronunciation audio, and progress relationships.
- A Translation belongs to exactly one Sense and one Answer Language. A Sense may contain Translations in one or more Answer Languages.
- A Language Pair is derived from translations that exist for one Learning Language and Answer Language. It is not a user-managed ownership record and has no primary flag.
- Preferred Answer Language is computed from the number of distinct Senses translated into each Answer Language. Most recent usage breaks a tie.
- Active Learning Language is stored as synchronized account state and scopes current library, capture, Collections, Scheduled Review, and Free Practice across clients.
- An intentional adapter capture may create a previously absent derived Language Pair and switch Active Learning Language. The client announces that switch.
- Adapters provide language metadata when known. Other capture flows use detection only above an explicit confidence threshold; otherwise the Learner confirms an editable chip. Preferred Answer Language is the fallback selection.
- If a matching Vocabulary Entry has exactly one Sense, a capture in a new Answer Language can attach its Translation to that Sense. If it has multiple Senses, the Learner chooses an existing Sense or creates one. Expression equality alone never proves Sense equality.
- Each Card identity includes Sense, Answer Language, and direction. Recognition asks for the named Answer Language; recall asks for the Learning Language. Schedules remain independent.
- Scheduled Review and Free Practice have exactly one Learning Language boundary. Scheduled Review may interleave Answer Languages and must display the expected language. No session may mix Learning Languages.
- Existing FSRS behavior, four ratings, durable review events, and the distinction between Scheduled Review and Free Practice remain in force.
- A Vocabulary Entry has at most one pronunciation Audio Clip. An Example has at most one sentence Audio Clip.
- On explicit adapter Save, Lexync copies eligible audio bytes into learner-private object storage and does not retain the source URL. Later automatic capture neither adds nor replaces an existing clip. Explicit learner actions may replace or remove it.
- Audio never autoplays. First playback may populate an account-scoped offline cache. Missing, expired, unsupported, or failed audio never blocks save, synchronization, or practice.
- Audio ownership is enforced at storage and metadata layers. Synchronization, export, sign-out cleanup, deletion, and cache eviction include audio.
- The migration follows expand-and-contract. Existing Study Pair data remains readable during rollout. Entries with the same normalized Expression are consolidated by Learning Language, but existing Senses remain separate unless equivalence is proven. No translations, Examples, Collections, audio, suspension state, Cards, review events, or schedules are deleted.
- PR #78 is merged historical work. Its recognition schedule and events are migration inputs, not work to revert or discard.
- Onboarding asks only for the first Learning Language. Add/remove management lives in Settings; the synchronized selector lives beside the profile in full clients and in a compact extension header.
- Page-level Study Pair controls are removed as clients adopt the new model.
- The canonical visual palette starts with logo purple `#6429f4`, dark ink, white, and lavender neutrals. Initial redesign is light mode. Dark mode is deferred.
- The project-pinned Impeccable skill guides audit, interaction, accessibility, and platform adaptation. The project-pinned design-taste-frontend skill applies only to web-appropriate visual work. A semantic contract maps into CSS and Jetpack Compose now and SwiftUI later.
- Supabase remains authoritative. Web and extension use the existing browser synchronization seams; Android uses its native local store and synchronization path; future iOS follows the documented contracts.
- Portable JSON export describes Learning Languages, Translations with Answer Languages, Collections, audio manifests, Cards, and review history. Import remains separate work.

## Testing Decisions

- Tests assert externally visible behavior and durable contracts rather than component structure or private implementation details.
- PostgreSQL migration and policy tests prove lossless conversion, compatibility reads, derived-language queries, account-wide Active Learning Language, private storage access, audio cleanup, and review-history preservation.
- Playwright exercises onboarding, the synchronized Learning Language selector, multilingual capture, ambiguous Sense selection, mixed-Answer-Language review, audio playback behavior, and responsive/accessibility behavior across web and extension fixtures.
- Adapter tests use controlled Duolingo and Clozemaster HTML/media fixtures; live third-party pages are not a deterministic test seam.
- Domain tests prove normalization, Preferred Answer Language selection and tie-breaking, Card identity, session boundaries, and migration mappings.
- Android emulator instrumentation covers synchronized language switching, library/session scoping, offline review queues, private audio playback, and semantic design adaptation.
- Future iOS XCUITest scenarios mirror the same user-visible contracts when iOS delivery resumes; they do not block current CI.
- Existing landing, authentication, extension capture, account snapshot, ownership-policy, vocabulary management, and scheduled-recognition tests are extended rather than replaced.
- Accessibility acceptance includes keyboard completion, visible focus, semantic names and states, error association, status announcements, contrast, text scaling, touch targets, and reduced motion.
- Destructive journeys verify retained or removed data, not merely confirmation-dialog presentation.

## Out of Scope

- Mixing different Learning Languages in one Scheduled Review or Free Practice session.
- A user-managed primary Language Pair or onboarding choice of Answer Language.
- Automatically merging existing Senses based only on matching Expression text.
- Autoplay, audio-only exercises, speech recognition, recording, or audio publication.
- Shared or published Examples, contributor workflows, moderation, or public learning material.
- Dark appearance in the first visual redesign.
- Offline vocabulary creation or editing.
- Import and import-specific conflict resolution.
- Paid subscriptions, social authentication, and administrative invitation systems.
- Firefox and Safari extension delivery in the first release.
- Active iOS implementation while the iPhone roadmap remains paused.

## Further Notes

- The domain vocabulary in `CONTEXT.md` is normative for issue and implementation language.
- ADR 0001 records the hard-to-reverse language-boundary decision and the required lossless migration.
- Closed Study Pair tickets remain historical evidence. They should receive supersession links rather than rewritten descriptions.
- The authenticated web application is an active learning client; the older description of web as only a landing and administration surface is superseded.
- Browser storage is less durable than native storage. Interfaces must communicate synchronization state honestly, and no local-only review event may be presented as safely synchronized.
