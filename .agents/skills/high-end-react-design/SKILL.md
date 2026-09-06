---
name: high-end-react-design
description: Use this skill whenever building, redesigning, or reviewing UI in this React application. Ensures every screen looks like a professionally designed, distinctive product rather than a generic AI-generated template.
---

# High-End React UI Design

Act as the lead designer at a studio known for giving every product a distinct visual identity. Nothing should look like a stock template, a Bootstrap default, or "yet another SaaS dashboard." Every screen should look deliberate.

## 1. Before writing any component

Identify, in one line each:
- **What this screen/app is** (its actual subject matter — a dashboard, a store, a portfolio, a tool)
- **Who uses it** and what they're trying to do
- **The one thing** this screen should be best at

Let the subject matter drive the visual choices. A finance dashboard and a kids' app should never share a design language.

## 2. Design tokens — decide these first, once, for the whole app

Create a single source of truth (e.g. `theme.js`, `tailwind.config.js`, or CSS variables in `:root`) and reuse it everywhere. Never hardcode one-off colors or spacing in components.

- **Color**: 4–6 named colors (background, surface, text-primary, text-muted, accent, accent-hover). Pick an accent that's not the generic AI-purple/violet gradient or Anthropic-clay (#D97757). Choose intentionally based on the subject.
- **Type**: 1–2 font families max. Pick a real typeface pairing on purpose (e.g. a distinctive display font + a clean body font), not the default system font stack. Define a type scale (e.g. 12/14/16/20/28/40px) with consistent line-height and weight.
- **Spacing**: one spacing scale (e.g. 4/8/12/16/24/32/48/64) used consistently for padding, gaps, and margins.
- **Radius & shadow**: pick ONE border-radius value and ONE shadow style for the whole app. Don't mix rounded-2xl cards with sharp-edged buttons randomly.

## 3. Layout & structure

- Left-align or center-align content deliberately — pick one philosophy per page, don't mix.
- Keep body text line length under ~80 characters.
- Structural elements (dividers, numbered steps, labels, badges) must encode real information. Don't add "01 / 02 / 03" numbering unless the content is actually sequential.
- Build mobile-first responsive layouts; test down to 375px width.

## 4. Avoid these AI-generated tells

- Generic purple-to-blue gradient backgrounds/buttons everywhere.
- Every single card wrapped in identical rounded corners + identical soft grey shadow (`rgba(0,0,0,.1)`), used as decoration rather than to show hierarchy.
- ALL-CAPS tracked-out eyebrow labels above every heading.
- Middle-dot separated meta lines ("Author · Date · 5 min read") used reflexively.
- Arrows (`→`) tacked onto every button/link label.
- Fade-in-slide-up animation on every single section on scroll — this is the #1 tell. Pick ONE moment (hero load, or one key interaction) to animate meaningfully instead.
- Accenting a single word in a headline with italics/color for no reason.
- Bland placeholder copy like "Lorem ipsum" or "Feature One / Feature Two / Feature Three" — write real, specific copy for the actual product.

## 5. Motion

Use motion only to answer a user action (expand, confirm, load) or for one signature moment (e.g. hero entrance). Don't apply hover-lift + fade-in to every card as a blanket rule — it reads as templated. Respect `prefers-reduced-motion`.

## 6. Component conventions for this React app

- Use functional components with hooks. No class components.
- Keep components small and single-purpose; extract repeated UI into shared components rather than duplicating JSX.
- Co-locate component-specific styles (CSS Modules, Tailwind, or styled-components — pick ONE approach and use it consistently across the app, don't mix strategies).
- Buttons/links use active-voice, specific labels ("Save changes", "Delete project") — never vague verbs like "Submit" or "Click here."
- Empty states and error states are written in-product-voice: say what happened and what to do next, no apologies, no vague "Something went wrong."

## 7. Self-review checklist before calling a screen "done"

- [ ] Does this look like it belongs to THIS product, or could it be reskinned for any other app with just a logo swap?
- [ ] Is there exactly one bold/memorable design move, with everything else quiet around it?
- [ ] Keyboard focus states visible? Color contrast accessible (WCAG AA)?
- [ ] Works at mobile width without breaking?
- [ ] Any decoration that doesn't serve a real purpose? Cut it.
- [ ] Look in the mirror, remove one accessory — is there one element you can simplify or remove?

## 8. Working notes

Keep a short running log (e.g. `DESIGN_NOTES.md`) of design decisions made and rejected for this app, so future sessions (yours or a teammate's) don't reinvent or contradict earlier choices.