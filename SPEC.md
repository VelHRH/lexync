# Lexync Product Specification

## 1. Product vision

Lexync is an offline-capable personal language-learning system. It lets a Learner capture words and phrases while browsing, synchronize them across devices, and practise them on an iPhone without an internet connection.

Lexync is offline-first for lessons, not for authoring. Creating or changing vocabulary requires connectivity. An authenticated Learner can continue downloaded lessons indefinitely while offline, and review results synchronize after connectivity returns.

## 2. Initial product surfaces

### 2.1 Browser extension

The Chromium Manifest V3 extension is the primary vocabulary-capture surface. It supports:

- manual entry;
- capture from ordinary webpages;
- an explicit Save action supplied by site-specific adapters;
- local contextual assistance through Learning Mode;
- local lookup of saved Expressions from a synchronized vocabulary index.

The first release targets Chromium browsers, including Chrome, Edge, Brave, and Vivaldi. Firefox and Safari are outside the first-release scope.

### 2.2 iPhone application

The native iPhone application supports:

- online manual vocabulary entry;
- synchronization of learning material;
- Scheduled Reviews;
- Free Practice by Collection;
- offline lesson sessions using previously synchronized data;
- queued synchronization of offline review results.

Offline vocabulary creation and editing are outside the first-release scope.

### 2.3 Web application

The Next.js application is not part of the Learner's core study workflow in the first release. It provides:

- the public landing page;
- authentication callbacks;
- administration;
- future trusted-contributor tooling.

## 3. Accounts and local access

- Email and password registration, sign-in, confirmation, and password recovery are the first-release authentication methods.
- The same account is used by the extension and iPhone application.
- After a successful login and synchronization, offline lessons remain available until the Learner logs out or removes the application.
- Server-side revocation takes effect the next time the device connects.
- Logging out erases local vocabulary, Examples, review history, and cached media for that account. Server data remains intact.

## 4. Language organization

- Languages and language variants use BCP 47 tags.
- Variants such as `pt-BR`, `pt-PT`, `zh-Hans`, and `zh-Hant` are distinct for vocabulary matching.
- A Learner may have multiple Study Pairs for one Target Language.
- A Learner explicitly chooses the primary Study Pair for each Target Language.
- A Study Pair is unique by Learner, Target Language, and Reference Language.
- Material captured from multiple source applications feeds the same Study Pair when its two languages match.
- Collections belong to exactly one Study Pair.

## 5. Vocabulary domain

### 5.1 Expression identity

- An Expression is either a word or an exact multi-word phrase.
- Lexync does not normalize an Expression to a lemma.
- Inflected and conjugated forms are separate Expressions.
- Expression matching preserves the captured spelling in Examples while deduplicating with language-aware case comparison, Unicode normalization, trimming, and insignificant-whitespace normalization.
- A selected phrase is not decomposed automatically into individual words.

### 5.2 Vocabulary Entries and duplicates

- A Vocabulary Entry is unique by Learner, Study Pair, and Expression.
- Capturing an existing Expression enriches the existing Vocabulary Entry rather than creating a duplicate.
- A repeated capture may add an Example or a new Sense.
- The same Expression may have separate Vocabulary Entries in different Study Pairs.
- A suspended Vocabulary Entry still counts as saved in Learning Mode but produces no Scheduled Reviews.

### 5.3 Senses and translations

- A Vocabulary Entry may contain multiple Senses.
- Senses and translations are private to the Learner and are not shared globally.
- Each Sense owns one or more translations in the Study Pair's Reference Language.
- Each Example attached to a Vocabulary Entry must be assigned to exactly one personal Sense.
- For one-click application captures, an extracted translation is matched against existing Sense translations. A match enriches that Sense; otherwise Lexync creates a new Sense and attaches the Example to it.

### 5.4 Examples

- A Vocabulary Entry may have multiple Examples.
- An Example contains the sentence text and may eventually reference optional audio.
- The first release stores private Example text but no source URL, page title, source application, or capture provenance.
- Capturing from a plain webpage pre-fills the locally detected surrounding sentence.
- The Learner may edit or remove the pre-filled sentence before saving.
- Only confirmed vocabulary data is sent to Supabase; Lexync does not upload the rest of the page.

### 5.5 Collections

- Collections are flat and do not support nesting.
- A Vocabulary Entry may belong to multiple Collections in its Study Pair.
- Collections cannot mix Vocabulary Entries from different Study Pairs.

## 6. Capture workflows

### 6.1 Study Pair resolution

Lexync resolves a Study Pair in this order:

1. A site-specific adapter supplies known course languages when available.
2. Otherwise, the extension detects the page language.
3. The detected Target Language maps to the Learner's primary Study Pair.
4. If detection is unreliable or no configured Target Language matches, the Learner must choose a Study Pair.
5. A manual choice is remembered for the current website and may be changed later.

Browser language detection is a hint and never creates a Study Pair automatically.

### 6.2 Learning Mode

- Learning Mode is opt-in per website.
- The extension reads a bounded sample of visible page text to detect configured Target Languages automatically.
- Learning Mode treats an Expression saved in any Study Pair for the same Target Language as saved.
- A saved Expression receives a subtle visual treatment and opens its personal details.
- Hovering an unsaved word offers an Add action without permanently decorating every unknown word.
- Clicking a word opens capture for that token.
- Selecting multiple words opens capture for the exact selected phrase.

### 6.3 Plain webpages

- Capture from a plain webpage is not one-click.
- The Learner must provide the translation before saving.
- The surrounding sentence is offered as an editable private Example.
- The active Study Pair remains visible and changeable before saving.

### 6.4 Manual entry

- Manual entry is available in the extension and, while online, on iPhone.
- The Learner supplies the Expression, Study Pair, translation, and any optional Example.

### 6.5 Duolingo and Clozemaster adapters

- Adapters add an explicit Save action to supported lesson pages.
- Save extracts the displayed Expression, translation, Example, and eventually any available audio.
- Adapter capture is one-click because the source lesson already supplies a translation.
- Adapters do not automatically import every encountered lesson item.
- Adapter behavior is tested against controlled HTML fixtures rather than live third-party pages.
- These adapters follow the private learning loop rather than blocking its first release.

## 7. Practice and scheduling

### 7.1 Card model

- Each Sense produces separate recognition and recall Cards.
- Recognition presents the Target Expression and asks for its translation.
- Recall presents a translation and requires the Learner to type the Target Expression.
- Each Card has independent learning progress.

### 7.2 First-release exercises

The first release contains two exercise types:

1. Target Expression to translation recognition.
2. Translation to typed Target Expression recall.

Recognition uses multiple choice when good distractors exist among other active Senses in the same Study Pair. When there are insufficient distractors, it uses reveal and rating instead of inventing weak choices.

Typed grading ignores surrounding whitespace, Unicode-equivalent representations, and configured punctuation or capitalization differences. It does not silently accept spelling changes. The Learner may override an incorrect automatic judgment.

Cloze exercises and audio-based exercises are outside the first-release scope.

### 7.3 Review ratings

Every reviewed Card receives one of four ratings:

- Again;
- Hard;
- Good;
- Easy.

The application preselects a rating from the exercise result, and the Learner may override it before continuing.

### 7.4 Scheduling

- Lexync uses FSRS for Scheduled Reviews.
- Desired retention defaults to 90% and may become configurable.
- Review attempts are durable chronological events, allowing schedules to be rebuilt after offline synchronization.
- Only Scheduled Reviews update FSRS schedules.
- Free Practice records session results but does not postpone Scheduled Reviews.

### 7.5 Audio

- Audio is optional pronunciation reference material, not an exercise input.
- Missing audio never excludes a Card from practice.
- Audio playback and reusable audio storage are deferred until after the private learning loop is stable.
- The intended later model permits storing extractable audio in object storage and restricting playback to trusted users, but its publication, access, takedown, and copyright rules remain intentionally unresolved.

## 8. Sharing roadmap

Shared Examples are not required for the first private-learning release.

The agreed direction for a later release is:

- newly captured Examples are private by default;
- only trusted contributors may explicitly publish Examples;
- a published Example belongs to the Target-language Expression rather than a Study Pair;
- an Example sentence and its audio may therefore be reused across Reference Languages;
- any translated Example text remains Reference-language-specific;
- published Examples form a candidate library and do not enter lessons automatically;
- a Learner explicitly attaches a shared Example to a Vocabulary Entry and assigns it to one personal Sense;
- deleting a contributor's personal Vocabulary Entry does not delete previously published shared material.

Contributor withdrawal, moderation, takedown, and reusable-audio access policies are deferred.

## 9. Offline behavior and synchronization

- Supabase is the authoritative data store.
- Vocabulary creation and editing require connectivity.
- The extension maintains a local IndexedDB index for Learning Mode and offline lookup of synchronized Expressions.
- The iPhone application stores synchronized learning material and schedules in SQLite.
- Offline iPhone lessons append review events to a durable local queue.
- On reconnection, the application uploads queued review events before downloading the current account snapshot and schedules.
- Audio, when introduced, downloads separately and on demand.
- The first release favors account snapshots over a general-purpose realtime synchronization engine.

## 10. Data portability

- The first release supports a portable JSON export.
- Export contains Study Pairs, Vocabulary Entries, Senses, private Examples, Collections, and review history.
- Import is outside the first-release scope because duplicate and conflict resolution require separate design.

## 11. Technical architecture

### 11.1 Repository

Lexync uses one repository with this intended structure:

```text
apps/
  extension/
  ios/
  web/
packages/
  domain/
  supabase/
```

The pnpm workspace manages JavaScript and TypeScript packages. Xcode manages the native iOS project within the repository.

### 11.2 Backend

- Supabase provides email and password authentication, PostgreSQL, generated APIs, Row Level Security, Storage, database functions, and Edge Functions.
- There is no separate Effect service.
- Browser and native clients may call Supabase directly under Row Level Security.
- Atomic or privileged operations use PostgreSQL functions or Supabase Edge Functions.
- Secret or service-role credentials never ship in a client.

### 11.3 Web and extension

- Web: Next.js.
- Extension: WXT, React, TypeScript, Supabase JS, and IndexedDB.
- Shared TypeScript domain contracts live in a workspace package.

### 11.4 iPhone

- UI: SwiftUI.
- Local persistence: GRDB over SQLite.
- Backend client: Supabase Swift.
- Offline synchronization is explicit application logic; Supabase Realtime is not treated as a durable offline queue.

## 12. Security and privacy requirements

- All private tables and Storage objects are protected by ownership-aware Row Level Security.
- Shared and trusted-only content has explicit access policies separate from private Learner data.
- Browser site access is requested on demand.
- Plain-page processing occurs locally except for the data the Learner confirms for capture.
- Logging out clears all local account data.
- No secret or service-role key is present in extension, web-client, or iPhone bundles.

## 13. Acceptance-test-first delivery

No product feature is implemented before its user-facing acceptance criteria exist as an executable end-to-end scenario.

### 13.1 First vertical slice

The first acceptance scenario proves that:

1. A test Learner signs in.
2. The Learner creates a Study Pair.
3. The Learner captures one Expression, translation, and optional Example from a controlled webpage through the extension.
4. The Vocabulary Entry synchronizes to the iPhone application.
5. The iPhone goes offline.
6. The Learner completes a practice Card.
7. The iPhone reconnects.
8. The review event synchronizes and the resulting progress is visible.

### 13.2 Test boundaries

- JavaScript and TypeScript user journeys use Playwright Test.
- Native iPhone journeys use an iPhone simulator and native UI tests.
- CI runs against a local Supabase instance.
- Webpage and language-application behavior uses controlled fixtures.
- Email and password authentication is covered by deterministic CI scenarios; live Duolingo/Clozemaster integrations use separate smoke checks.

## 14. First-release boundary

The first usable release includes:

- email and password registration, sign-in, and password recovery;
- Study Pair management and explicit primary selection;
- manual and plain-webpage extension capture;
- online manual iPhone capture;
- private Vocabulary Entries, Senses, Examples, and Collections;
- Learning Mode;
- synchronized iPhone data;
- offline Scheduled Reviews and Free Practice;
- FSRS scheduling;
- suspension of Vocabulary Entries;
- JSON export.

The following are subsequent milestones:

- Duolingo and Clozemaster adapters;
- cloze exercises;
- audio capture, storage, and playback;
- trusted-contributor Example publishing;
- shared Example discovery and attachment;
- import;
- Firefox, Safari, and additional mobile platforms.

## 15. Working name

The working product and repository name is **Lexync**. The name combines the ideas of a lexicon and synchronization. It has not undergone formal trademark, domain, package-name, or App Store clearance and may be changed before public release.
