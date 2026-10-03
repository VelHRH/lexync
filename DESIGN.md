---
name: Lexync
description: A private reading companion that turns chosen language into durable practice.
colors:
  spark-violet: "#611efc"
  spark-violet-hover: "#5218d6"
  spark-violet-active: "#4413b0"
  brand-deep: "#00207c"
  ember: "#df8256"
  ember-readable: "#9d4a22"
  ember-soft: "#f6ddcb"
  deep-ink: "#15213f"
  quiet-ink: "#5a6682"
  canvas: "#ffffff"
  sky-wash: "#f2f6fd"
  sky-selected: "#e3ecfa"
  sky-strong: "#cfdef5"
  success: "#15724a"
  warning: "#8a5212"
  danger: "#b3261e"
  info: "#4413b0"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "3.25rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Plus Jakarta Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.15
  body:
    fontFamily: "Atkinson Hyperlegible, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Atkinson Hyperlegible, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.15
rounded:
  field: "12px"
  control: "999px"
  surface: "16px"
  feature: "24px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "64px"
components:
  button-primary:
    backgroundColor: "{colors.spark-violet}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.control}"
    border: "1px solid rgba(0, 32, 124, 0.18)"
    shadow: "0 8px 24px rgba(0, 32, 124, 0.09)"
    padding: "11px 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.spark-violet-hover}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.field}"
    border: "1px solid rgba(0, 32, 124, 0.18)"
    padding: "11px 13px"
    height: "48px"
  select:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.field}"
    border: "1px solid rgba(0, 32, 124, 0.18)"
    padding: "11px 42px 11px 13px"
    height: "48px"
---

# Design System: Lexync

## Overview

**Creative North Star: "Light Through Glass"**

Lexync should feel like a quiet, well-lit desk by a window: the learner's own language is the only solid thing on it, and everything the product adds — navigation, chrome, dialogs — is a pane of glass that lets the page beneath stay visible. The surface is calm and atmospheric, the task is sharp and opaque.

The execution is soft and dimensional. A single blue gradient ground carries the whole product, violet marks everything the Learner can act on, generous radii replace hard corners, structure comes from a hairline edge and a tinted shadow instead of an outline, and a warm ember accent keeps the ground from reading as cold or clinical.

**Key Characteristics:**

- One gradient ground in two densities: generous on public surfaces, nearly still inside the product
- Glass for chrome, opaque white for anything carrying text
- A geometric sans for voice, a high-legibility sans for everything operable, a typewriter face reserved for the learner's own material
- Radius as a hierarchy signal: the larger the surface, the rounder the corner
- Violet for action, navy for depth, ember for warmth and one meaning — never for interaction

## Colors

The palette is derived from the whole brand artwork rather than from one glance at it. The fox mark and the wordmark are drawn in deep navy, and the wordmark sets one letter apart in violet. Navy is therefore the depth of the system and the palest end of the ground gradient; the violet of that one letter is what the Learner acts on.

### Primary

- **Spark Violet:** Primary action, focus, selection, and active navigation. It is the violet of the letter the wordmark sets apart.
- **Brand Deep:** The identity navy. It fills gradients, brand blocks, and large sweeps; it is not a button color.
- **Pressed Violet:** Hover and active steps deepen predictably.

### Secondary

- **Ember:** The warm accent. It lives in gradients, illustrative fills, and decorative plates.
- **Ember Readable:** The darkened sibling used whenever ember must carry text or an icon.

**The Ember Never Clicks Rule.** Ember marks warmth, atmosphere, and at most one semantic layer (the learner's own captured language and its counters). It never colors a button, a link, a focus ring, or a selected state — those are always violet. Two competing calls to action is the failure this rule prevents.

**The Two-Stop Rule.** A gradient on anything the Learner acts on — an active navigation item, an avatar, a counter — runs navy into violet and stops there. The three-stop sweep that ends in ember is reserved for large decorative brand panels, such as the aside beside the sign-in form. Three brand colors inside a control the width of a word read as decoration fighting the label.

### Neutral

- **Deep Ink:** Primary text and icons.
- **Quiet Ink:** Supporting text that still meets contrast requirements.
- **Canvas:** The fill of a content card. Always fully opaque.
- **Sky Wash / Sky Selected / Sky Strong:** Quiet regions, hover and selected states, and the stops of the ground gradient.

**The Violet Has a Job Rule.** Violet marks identity, the primary action, focus, or current selection. The ground gradient is the one exception: there, blue is atmosphere, and it is kept pale enough that nothing reads as interactive.

## Typography

**Display Font:** Plus Jakarta Sans with Segoe UI and system-ui fallback
**Body Font:** Atkinson Hyperlegible with Segoe UI and system-ui fallback
**Material Font:** Courier Prime with Courier New fallback

**Character:** The display face is a geometric sans with soft, open shapes — it carries the product's voice in page titles, hero lines, and card titles. Atkinson Hyperlegible carries everything the learner operates and reads at length, because an adult reading an unfamiliar language needs letterforms that cannot be confused. Courier Prime survives in exactly one role: the learner's own captured expression and quoted source material, where monospacing says "this is your material, not our interface."

**The Operable Face Rule.** Display type never sets a button, a navigation item, a form label, or an error message. If a person clicks it or types into it, it is body type.

**The Material Face Rule.** The typewriter face sets captured expressions and quoted passages, and nothing else. It is never a heading, never a counter, and never a stylistic flourish.

### Hierarchy

- **Display** (700, 3.25rem, 1.05): Public hero and the product page title, limited to two balanced lines.
- **Headline** (600, 1.75rem, 1.15): Major public sections and exceptional product empty states.
- **Title** (600, 1.375rem, 1.15): Product panel and card titles.
- **Body** (400, 1rem, 1.5): Explanations and form content, capped near 70 characters.
- **Label** (700, 0.875rem, 1.15): Controls, metadata, navigation, and compact status.

**The Task Scale Rule.** Authenticated web and extension UI use fixed sizes. Fluid display type belongs only to public brand moments.

## Surfaces, Glass, and Ground

The product sits on a gradient ground: two pale blue radial pools and a faint ember bloom in the far corner, over a near-white linear base. It exists in two densities — the public density is visible and warm, the product density is almost still, so a page of text never competes with its own background.

Glass is a material with one job: it lets the learner see that content continues beneath a layer that floats over it.

**The Glass Carries No Paragraph Rule.** Glass is for chrome — the header, navigation, dialogs, dropdowns, toasts, and floating controls. Anything that carries a sentence the learner has to read — a lesson, a vocabulary card, a learning material — is an opaque white sheet.

**The Blur Where There Is Content Rule.** `backdrop-filter` is applied only where real content scrolls beneath the layer. Over the smooth ground gradient there is nothing to blur, so those surfaces use a translucent fill and a highlight instead and cost nothing.

Glass must degrade honestly. Where `backdrop-filter` is unsupported, and whenever `prefers-reduced-transparency: reduce` or `prefers-contrast: more` is active, every glass fill becomes fully opaque and the blur is dropped.

**The Host Page Is Not Ours Rule.** Injected extension controls sit over arbitrary websites whose background we cannot know. They take the new radii, colors, and shadows, but their fill is always 100% opaque and they never blur.

## Elevation

Elevation is a soft, multi-layered shadow tinted with the brand navy rather than black, so a raised block reads as lit from the same window as everything else.

### Shadow Vocabulary

- **Quiet:** A block that must separate from the ground without claiming a layer.
- **Low:** Secondary buttons, navigation items, compact controls.
- **Medium:** Primary actions, entry cards, the composer.
- **High:** Dropdowns, popovers, injected extension surfaces.
- **Dialog:** Modal dialogs and capture sheets.
- **Inset highlight:** The one-pixel light line along the top edge of a glass surface. It is what makes glass read as having thickness.

**The Shadow Means Distance Rule.** A shadow says how far a block sits from the ground, not whether it can be clicked. Interactivity is carried by shape, color, and the cursor.

**The Settled Press Rule.** Pressing a control darkens its fill slightly and drops its shadow one step. Nothing moves. A control that jumps on press reads as a rendering bug in a soft system.

## Components

### Buttons

- **Shape:** Pill. Height 44px minimum, one-line label.
- **Primary:** Spark Violet fill, white text, hairline edge, medium shadow.
- **Secondary:** Canvas fill, ink text, hairline edge, low shadow; hover lifts to Sky Selected.
- **Hover / Focus / Press:** Deepened violet on hover, the settled press above, and a visible violet focus ring.
- **Disabled:** Muted surface, quiet border, muted ink, no shadow. Never a translucent copy of the enabled state.

### Cards / Containers

- **Corner Style:** 16px for cards, 24px for tiles, the composer, and dialogs. A nested element is always rounded less than its parent.
- **Background:** Opaque canvas. Quiet or out-of-rotation cards use the muted surface.
- **Shadow Strategy:** Medium for the sheet the learner is working in, low for list cards, none for a read-only region that spacing already separates.
- **Border:** A hairline in translucent navy. Inside a card, separate regions with a quiet rule, never a second edge.
- **Nesting:** One edge deep. A bordered box inside a bordered box is always wrong.
- **Internal Padding:** 16px compact, 20px standard, 32px spacious.

### Inputs / Fields

- **Style:** 48px minimum height, 12px radius, hairline edge, clear label directly above the field it names, and stable helper/error space.
- **Label Placement:** A label sits on the line above its own control and shares its width.
- **Select:** Remove browser appearance, reserve 42px for a dedicated chevron, and preserve native keyboard semantics unless a richer menu is required.
- **Focus:** Violet outline and focus ring without layout shift.
- **Error / Disabled:** Semantic text and surface roles inside the field's own block; never color alone.

### Surfaces

The authenticated product has no page wrapper. Header and navigation rail are glass chrome floating on one continuous gradient ground; page content sits directly on that gradient with nothing behind it. A white card is reserved for blocks that are genuinely an entity the Learner owns — a vocabulary entry, a material row, a collection — never for a container around a whole surface.

**The Wrapper Is Not a Card Rule.** If a block exists only to hold other blocks, it gets no fill, no edge, and no shadow. A card inside a card is always a mistake.

A section with more than one kind of surface under it offers them as tiles rather than hiding them behind links. A tile carries its own availability — a count, a reason it cannot be entered, or the word that describes resuming — because the surfaces behind some tiles are full-screen and have no chrome to escape from.

The Dynamic Lesson composer is the front door: one short question, one input, a few ready-made phrasings, and nothing else. It carries no page title, because a heading above a centered composer is noise; the title exists for assistive technology only.

### Navigation

The authenticated product has no header. Orientation lives in one sidebar that runs the full height of the viewport: the brand at the top, the task destinations in the middle, and the active Learning Language and the profile entry pinned to the bottom. Every destination carries a line icon beside its name, so the rail stays readable once the labels are gone. The sidebar is glass over the ground, it keeps a fixed width that never grows with the viewport, and it collapses to a rail of those icons when the Learner wants the room. Collapsed, the brand mark doubles as the way back: hovering or focusing it swaps the mark for the panel control that expands the sidebar again. Everything else is content. The sidebar never collects task actions — those belong to the surface that owns the task.

**The Chrome Does Not Grow Rule.** Widening the window gives the extra room to the content, never to the navigation. A rail that scales with the viewport makes a wide screen feel emptier, not larger.

**The One Measure Rule.** Every block on a surface shares the same left and right edge. A list, a toolbar, and a heading that each invent their own width read as three unrelated pages stacked on one. The Learning Language control is a flag and its tag, never a sentence. Account details and sign out live on the Profile surface. Wide screens use a quiet navigation rail over the ground; narrow screens switch to reachable bottom navigation. Current location is visible through the brand gradient fill, weight, and shape rather than a decorative dot.

### Empty and Loading States

Empty states are a soft tinted panel on the sky wash, not a line of grey text. They carry a short display-type sentence about what the learner is missing, one sentence of body copy naming what to do, and the action itself. Loading states preserve the final layout with rounded skeleton cards; they never replace the task with generic prose or a centered spinner.

## Do's and Don'ts

### Do:

- **Do** take the palette from the whole wordmark: navy for depth, the violet of its set-apart letter for action.
- **Do** keep the active Learning Language visually attached to the task it scopes.
- **Do** style every select, field, menu, focus ring, empty state, and validation state as part of one control system.
- **Do** keep desktop header geometry to one aligned row and verify it at 1024px and wider.
- **Do** give every glass surface an opaque fallback and verify it under reduced transparency.

### Don't:

- **Don't** resemble a generic AI-generated editorial landing page.
- **Don't** set a paragraph, a lesson, or a vocabulary card on a translucent surface.
- **Don't** let ember color a button, a link, a focus ring, or a selected state.
- **Don't** blur what has nothing but the ground gradient behind it.
- **Don't** move a control on press, or animate anything that does not report a state change.
- **Don't** nest a bordered box inside a bordered box, or give every card in a list its own row of actions.
- **Don't** set a button, a navigation item, a form label, or an error message in the display face, or set a heading in the typewriter face.
- **Don't** ship translucency into injected extension controls that sit over host pages.
