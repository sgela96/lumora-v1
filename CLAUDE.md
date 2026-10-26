# Lumora: notes for Claude

Read `README.md` and `docs/onboarding.md` first. Plans and limits live in `packages/shared/src/plans.ts`.

## Working with the owner
- Talk in Spanish. Product copy (website, back office, widget, e-mails, slides) is in English, with Spanish as the widget's second language.
- Open a branch and a PR to `main` for every change, and show screenshots of what changed.
- Ask before big redesigns the owner asked to discuss first (for example the dashboard customization).

## Brand
- The nebula is always pastel yellow `#FFD666`. Never orange, never configurable by customers.
- Apple-like and calm, with Lumora moments: soft glow, the iridescent gradient (`#ffe28a → #ffc7a6 → #e3c6ff → #b9dcff`) used sparingly.
- The widget's motion is part of the product: the nebula expands when the panel opens, contracts when it closes and absorbs the report with sparks after sending. Keep it.

## Visual QA before every PR (required)
Render the screens you touched (Playwright is installed) at desktop (1440 px) and phone (390 px) widths, in light and dark, and check:
- **Alignment and centering.** Icons centered inside their tiles and circular buttons (use `display: grid; place-items: center` and an SVG icon, never a text glyph like → or ✕, which sits off-center), text baselines lined up, equal padding on every side of buttons and chips.
- **Overlaps and overflow.** Nothing clipped, nothing on top of something else unintentionally, no horizontal scroll at 390 px.
- **Animations.** Step through them (pause and seek with `document.getAnimations()`) and confirm each frame looks right, including the start and end states.
- **Both themes.** The back office has a light/dark switch; check both.

## Checks
`npm run typecheck`, `npm test` and `npm run build` must pass before pushing.
