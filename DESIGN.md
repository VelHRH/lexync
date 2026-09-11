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
    fontFamily: "Avenir Next, Segoe UI, sans-serif"
    fontSize: "clamp(2.75rem, 6vw, 5.75rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Avenir Next, Segoe UI, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontFamily: "Inter, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  field: "10px"
  control: "10px"
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
    backgroundColor: "{colors.fox-purple}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.fox-purple-hover}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.field}"
    padding: "11px 14px"
    height: "44px"
  select:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.field}"
    padding: "11px 42px 11px 14px"
    height: "44px"
---

# Design System: Lexync

## Overview

**Creative North Star: "The Private Reading Desk"**

Lexync should feel like a focused place where something noticed in the wild becomes material worth keeping. Public surfaces make that transformation tangible through the fox identity and a direct capture-to-sync-to-practice composition. Product surfaces are calmer and denser: controls feel deliberate, language context stays visible, and the current task owns the page.

The system rejects generic AI editorial styling, default browser chrome, and card-grid dashboards. Purple is a precise action and identity signal, not atmospheric decoration. Character comes from strong alignment, compact control anatomy, clear state changes, and a few memorable brand moments.

**Key Characteristics:**

- Fox-led identity with product-derived learning visuals
- One dominant task per surface
- Fixed, compact product typography
- Custom-styled, accessible controls
- Restrained lavender layering with decisive purple actions

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

**Display Font:** Avenir Next with Segoe UI fallback
**Body Font:** Inter with Segoe UI fallback

**Character:** Brand headings are confident and rounded enough to belong with the fox mark. Product copy stays familiar, compact, and quiet so the learner's material remains the most important content.

### Hierarchy

- **Display** (700, responsive up to 5.75rem, 1.02): Public hero only, limited to two balanced lines.
- **Headline** (700, 2rem, 1.15): Major public sections and exceptional product empty states.
- **Title** (600, 1.25rem, 1.25): Product page and panel titles.
- **Body** (400, 1rem, 1.5): Explanations and form content, capped near 70 characters.
- **Label** (600, 0.875rem, 1.2): Controls, metadata, navigation, and compact status.

**The Task Scale Rule.** Authenticated web and extension UI use fixed sizes. Fluid display type belongs only to public brand moments.

## Elevation

Lexync uses tonal layering first and soft, tinted elevation only for floating menus, dialogs, and injected surfaces that must separate from an unknown host page. Static product sections do not receive shadows simply to look like cards.

### Shadow Vocabulary

- **Low ambient:** Quiet separation for menus and compact floating surfaces.
- **Medium ambient:** Dialogs, capture sheets, and extension overlays.
- **High ambient:** Rare modal or injected surface over visually complex content.

**The Earned Elevation Rule.** A shadow must explain stacking or interaction. If spacing and a background layer communicate the same relationship, remove it.

## Components

### Buttons

- **Shape:** Compact rounded rectangle (10px), never a default pill.
- **Primary:** Fox Purple, clear white text, 44px minimum height, one-line label.
- **Hover / Focus:** Deepened purple on hover, one-pixel tactile press, and a visible semantic focus ring.
- **Secondary / Ghost:** Dark ink on canvas or lavender wash with a real border when needed for contrast.

### Cards / Containers

- **Corner Style:** Soft surface radius (16px) or feature radius (24px) for major brand compositions.
- **Background:** Canvas or a single lavender layer chosen by hierarchy.
- **Shadow Strategy:** Flat by default; use elevation only for overlays.
- **Border:** One quiet boundary at most. Avoid nested bordered boxes.
- **Internal Padding:** 16px compact, 24px standard, 32px spacious.

### Inputs / Fields

- **Style:** 44px minimum height, 10px radius, explicit border, clear label above, and stable helper/error space.
- **Select:** Remove browser appearance, reserve 42px for a dedicated chevron, and preserve native keyboard semantics unless a richer menu is required.
- **Focus:** Purple outline and focus ring without layout shift.
- **Error / Disabled:** Semantic text and surface roles; never color alone.

### Navigation

Desktop product headers remain one aligned row. Brand, active Learning Language, primary action, and profile cluster have explicit priority and never wrap. Wide screens use a quiet navigation rail; narrow screens switch to reachable bottom navigation. Current location is visible through color, weight, and shape rather than a decorative dot.

### Empty and Loading States

Empty states explain the next useful action in one short sentence and expose that action directly. Loading states preserve the final layout with restrained skeletons; they do not replace the task with generic prose or a centered spinner.

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
- **Don't** build a compressed dashboard from repeated bordered cards.
- **Don't** use numbered sections, repeated uppercase kickers, ruled-column scaffolding, or oversized product headings.
- **Don't** allow the desktop header to wrap, misalign, or expose the full account email as primary content.
- **Don't** add decorative gradients, glass panels, status dots, or motion without a state or hierarchy purpose.
