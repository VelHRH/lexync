---
name: Lexync
description: A private reading companion that turns chosen language into durable practice.
colors:
  fox-purple: "#6429f4"
  fox-purple-hover: "#5120d2"
  fox-purple-active: "#4218b5"
  deep-ink: "#20153f"
  quiet-ink: "#5f5872"
  canvas: "#ffffff"
  lavender-wash: "#f3efff"
  lavender-selected: "#e7dcff"
  lavender-strong: "#d3c2ff"
  success: "#18794e"
  warning: "#8a5700"
  danger: "#b42318"
  info: "#2457a6"
typography:
  display:
    fontFamily: "Courier Prime, Courier New, monospace"
    fontSize: "2.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Courier Prime, Courier New, monospace"
    fontSize: "1.75rem"
    fontWeight: 700
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
  field: "0"
  control: "0"
  surface: "0"
  feature: "0"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "64px"
components:
  button-primary:
    backgroundColor: "{colors.fox-purple}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.control}"
    border: "2px solid {colors.deep-ink}"
    shadow: "4px 4px 0 {colors.deep-ink}"
    padding: "11px 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.fox-purple-hover}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.field}"
    border: "2px solid {colors.deep-ink}"
    padding: "11px 13px"
    height: "48px"
  select:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.field}"
    border: "2px solid {colors.deep-ink}"
    padding: "11px 42px 11px 13px"
    height: "48px"
---

# Design System: Lexync

## Overview

**Creative North Star: "The Card Index"**

Lexync should feel like a card index an adult keeps for a language they actually live in: something noticed in the wild gets written down, filed, and found again. Every vocabulary entry is a card the learner owns. Product surfaces are calm and dense: controls feel deliberate, language context stays visible, and the current task owns the page.

The execution is neubrutalist. Structure is carried by a two-pixel ink outline, square corners, flat fills, and a hard offset shadow with no blur. Nothing is soft, nothing floats, and nothing is decorated to look expensive. Purple is a precise action and identity signal, not atmospheric decoration.

**Key Characteristics:**

- A typewriter face for the learner's own language, a high-legibility sans for everything operable
- Square corners and ink outlines instead of radius and blur
- One dominant task per surface
- Fixed, compact product typography
- Restrained lavender layering with decisive purple blocks

## Colors

The palette pairs a singular fox purple with dark violet ink, clear white canvas, and lavender layers that communicate hierarchy without turning the interface into a purple wash.

### Primary

- **Fox Purple:** The canonical identity, primary action, focus, and selected-state color.
- **Pressed Purple:** Hover and active steps deepen predictably without glow.

### Neutral

- **Deep Ink:** Primary text and icons.
- **Quiet Ink:** Supporting text that still meets contrast requirements.
- **Clear Canvas:** Main reading and working surface.
- **Lavender Wash:** Navigation, grouped context, and low-emphasis regions.
- **Lavender Selected:** Selected and hovered product states.

**The Purple Has a Job Rule.** Purple marks identity, the primary action, focus, or current selection. It never fills space merely to make a screen feel branded.

## Typography

**Display Font:** Courier Prime with Courier New fallback
**Body Font:** Atkinson Hyperlegible with Segoe UI and system-ui fallback

**Character:** The display face is a typewriter, used where the learner's own material and the system's counters live: page titles, card titles, captured expressions, card numbers, and the small uppercase metadata line. Atkinson Hyperlegible carries everything the learner operates — buttons, navigation, labels, fields, running sentences — because an adult reading an unfamiliar language needs letterforms that cannot be confused.

**The Operable Face Rule.** Display type never sets a button, a navigation item, a form label, or an error message. If a person clicks it or types into it, it is body type.

### Hierarchy

- **Display** (700, 2.75rem, 1.0): Public hero and the product page title, limited to two balanced lines.
- **Headline** (700, 1.75rem, 1.15): Major public sections and exceptional product empty states.
- **Title** (700, 1.375rem, 1.15): Product panel and card titles.
- **Body** (400, 1rem, 1.5): Explanations and form content, capped near 70 characters.
- **Label** (600, 0.875rem, 1.2): Controls, metadata, navigation, and compact status.

**The Task Scale Rule.** Authenticated web and extension UI use fixed sizes. Fluid display type belongs only to public brand moments.

## Elevation

Lexync has no soft shadows. Elevation is a hard offset in ink with zero blur, and it means one thing: this block can be acted on. A static panel, a divider, or a read-only region takes no shadow at all.

### Shadow Vocabulary

- **Low (2px):** Secondary buttons and compact controls.
- **Medium (4px):** Primary actions, entry cards, the selected navigation block.
- **High (6px):** Dialogs, capture sheets, and injected extension surfaces.
- **Quiet (2px lavender):** A block that must separate from its background without claiming to be interactive.

**The Earned Elevation Rule.** A shadow must explain interaction. If spacing, an outline, or a background layer communicates the same relationship, remove it.

**The Felt Press Rule.** Pressing an elevated control moves it by its own offset and drops the shadow to none, so the block lands on the page. No opacity fades, no scale.

## Components

### Buttons

- **Shape:** Square rectangle, two-pixel ink outline, never a pill and never a radius.
- **Primary:** Fox Purple fill, clear white text, 44px minimum height, one-line label, medium offset shadow.
- **Secondary:** Canvas fill, ink text, the same outline, low offset shadow; hover lifts to Lavender Selected.
- **Hover / Focus / Press:** Deepened purple on hover, the felt press above, and a visible semantic focus ring.
- **Disabled:** Muted surface, quiet border, muted ink, no shadow. Never a translucent copy of the enabled state.

### Cards / Containers

- **Corner Style:** Square. Radius is not a hierarchy signal in this system.
- **Background:** Canvas on the lavender wash of the page, or Muted Surface when the card is out of rotation.
- **Shadow Strategy:** A card the learner acts on takes the medium offset shadow; a read-only panel takes none.
- **Border:** The two-pixel ink outline. Inside a card, separate regions with a quiet lavender rule, never a second outline.
- **Nesting:** One outline deep. A bordered box inside a bordered box is always wrong.
- **Internal Padding:** 16px compact, 20px standard, 32px spacious.
- **Anatomy:** Title and counter on one row, content, then at most one metadata row. Actions belong to the card being worked on, not to every card in the list.

### Inputs / Fields

- **Style:** 48px minimum height, square, two-pixel ink outline, clear label directly above the field it names, and stable helper/error space.
- **Label Placement:** A label sits on the line above its own control and shares its width. A label on one edge of the screen and its field on the other is a defect.
- **Select:** Remove browser appearance, reserve 42px for a dedicated chevron, and preserve native keyboard semantics unless a richer menu is required.
- **Focus:** Purple outline and focus ring without layout shift.
- **Error / Disabled:** Semantic text and surface roles inside a bordered block; never color alone.

### Navigation

Desktop product headers remain one aligned row. Brand, active Learning Language, primary action, and profile cluster have explicit priority and never wrap. Wide screens use a quiet navigation rail; narrow screens switch to reachable bottom navigation. Current location is visible through color, weight, and shape rather than a decorative dot.

### Empty and Loading States

Empty states are a dashed-outline block, not a line of grey text. They carry a short display-type sentence about what the learner is missing, one sentence of body copy naming what to do, and the action itself. Loading states preserve the final layout with outlined skeleton cards in lavender; they never replace the task with generic prose or a centered spinner.

## Do's and Don'ts

### Do:

- **Do** show the real capture, synchronization, and practice relationship on public surfaces.
- **Do** keep the active Learning Language visually attached to the task it scopes.
- **Do** style every select, field, menu, focus ring, empty state, and validation state as part of one control system.
- **Do** keep desktop header geometry to one aligned row and verify it at 1024px and wider.
- **Do** let the fox mark create one memorable orientation moment per surface.

### Don't:

- **Don't** resemble a generic AI-generated editorial landing page.
- **Don't** ship a default unstyled HTML application or browser-default dropdown.
- **Don't** nest a bordered box inside a bordered box, or give every card in a list its own row of actions.
- **Don't** set a button, a navigation item, a form label, or an error message in the display face.
- **Don't** use numbered sections, repeated uppercase kickers, ruled-column scaffolding, or oversized product headings.
- **Don't** allow the desktop header to wrap, misalign, or expose the full account email as primary content.
- **Don't** add decorative gradients, glass panels, status dots, blurred shadows, or motion without a state or hierarchy purpose.
- **Don't** reach for a coloured left edge as an accent. Structure comes from the full outline.
