# NENNBOX design foundation

## Verwaltungs-App (Claude-Design 2026-11-22)

The administrative app uses the separate, scoped `@nennbox/ui/app-tokens.css` token set, reproduced from the design handoff. It applies only to `.nb-admin-workspace` and `.nb-app-design`; the public website and registration form continue using the original `tokens.css` foundation below. App typography is locally bundled Inter 400/500/600 with tabular numerals and cv11, and JetBrains Mono 400/500 for codes. The app uses 6/8/12 px radii, 32 px controls and the reference motion/shadows. Shared app primitives are implemented in `packages/ui/src/app-primitives/` and shown in `/components`. The old foundation below remains authoritative for the public registration experience.



## Einrichten / Onboarding (Claude-Design 2026-11-22, #201)

The guided setup (`/app/onboarding-preview`, development and `VITE_ONBOARDING_PREVIEW=true` builds) uses the same scoped `--nb-*` tokens as the administrative app; it sets `nb-app-design` on its own root and creates no second token source. The few mint tints that exist only in the onboarding reference (`#DCEBE2`, `#19543C`, `#1F4A3A`, …) are component-local custom properties in `packages/ui/src/onboarding/onboarding-shell.css`.

Building blocks live in `packages/ui/src/onboarding/` and are shown in `/components` under "Einrichtung":

| Block | Purpose |
| --- | --- |
| `OnboardingShell` | Header with progress line, section bar, content, "Das entsteht", sticky foot bar. Below 1240 px "Das entsteht" becomes a bar plus sheet, below 980 px the section bar drops out. `wide` uses the whole middle column (summary). |
| `OnboardingSections` | Six sections (Konto, Verein, Veranstaltung, Teilnehmer, Nennung, Veröffentlichen). Finished sections are clickable, only the active one lists its screens, the bar never counts screens. |
| `ChoiceGroup` / `ChoiceCard` | Decision card: icon tile, title, one sentence, **consequence line** (always visible). States: rest, hover, recommended (badge), chosen (tick, never both), keyboard focus (ring), unavailable (with reason), locked (own label). Keys 1–9 choose, Enter continues (`QuestionStep`). |
| `EmergingList` | "Das entsteht": grouped rows with value or "noch offen", "abgeleitet", reasons for form fields and documents, "Abgeschaltet" for fields turned off, mint highlight (1.9 s) for rows the last answer changed. |
| `StepActions` | Back, "Überspringen — Wir nehmen den Vorschlag" (only where there is something to skip), key hints, main action. |
| `OnboardingField`, `OnboardingTextarea`, `OnboardingSwitch`, `OnboardingFileButton`, `NumberStepper` | Inputs of the setup; the address field carries its fixed `.nennbox.com`. |
| `OnboardingIcon` | Placeholder line icon (one path) for cards; real sketches are open. |

Rules that follow from the reference:

- No live preview. The only real preview is on the summary screen (tabs Veranstaltungsseite and Nennformular, built from the final proposal). Everything earlier shows lists.
- Suggestions carry "Empfohlen" but are never pre-selected; "Weiter" waits for a choice. "Überspringen" resets that screen’s answers (including follow-up controls) to the empty domain answers, so `null` accepts the current domain suggestion even after an explicit choice or cleared terms. Going back and continuing preserves an accepted language suggestion; only a first, unaccepted language screen with no selection means German alone.
- What follows from answers is shown with its reason on the right, not asked again.
- Setup ends in a draft ("Euer Entwurf steht"); opening is a separate, deliberate step.
- Text in the du/ihr voice, present tense. The public registration form keeps its own design system.

Open according to the reference (placeholders in use): drawings for the cards, final key bindings (Esc), logo/colour derivation step, legal participation terms, dark mode, leaving and coming back.

Implementation boundaries of the local prototype:

- Participant languages are German and English, matching the existing public form. Other reference languages stay unavailable with an explanation. Interface language is independently indicated as DE in the header; an interactive interface-language switch awaits translated setup copy (there is no English administrative interface yet). Do not make the participant-language choice change the office language.
- The form screen groups actual registration fields and only switches off optional fields. Required fields stay protected in `suggestEventConfig`, including after the event type changes.
- The summary alone renders proposal-based participant previews. Enter uses the same completion action as the footer; draft is the default, opening requires a deliberate choice. The draft's “Vorschau ansehen” returns to that local preview, not to an inactive external address.
- No server draft, private sharing token, demo entries, team invitations or mail-based return flow is invented. Links and publication are still local simulations; the draft explains this. QR output is generated only after the simulated opening.
- “Das übersetzt ihr selbst” counts the event title, each class name and participation terms per additional language as open. No missing translation blocks completion.
- Mobile retains the functional back button in the footer, alongside full-width forward navigation; the reference's separate top back arrow is not duplicated. Card rows, hidden descriptions, breakpoints (1240/980 px), sheet and summary stacking follow the reference CSS.

Verification for onboarding uses unit/route tests and CI. Do not take screenshots, compare pixels or start a local browser-smoke stack for this design work; final visual acceptance belongs to the lead. Inspect `quelle/O1Richtung.dc.html`, `quelle/O8Bausteine.dc.html`, the individual `quelle/*.dc.html` screens and `referenz/onboarding-bausteine.css` from the design handoff when changing these components.


This repository contains two separate design foundations: the new administrative app tokens above and the established public website/registration tokens below. The complete NENNBOX brandbook is maintained in the private design repository.

## Public website and registration tokens

The following legacy foundation remains in force for public surfaces and existing controls not yet migrated in the administrative app. It does not define the new administrative visual language.

Import `@nennbox/ui/base.css` for the reset, typography, focus behavior, motion preference, locally hosted fonts, and tokens. `@nennbox/ui/tokens.css` can be imported independently. TypeScript constants are exported by `@nennbox/ui`.

- **Color (M3):** Racing Green `#193B30`, Paddock Ivory `#F5F4EE`, White `#FFFFFF`, Ink `#111A16`, Night `#0F2219`, Mint `#B5E0CA`, Sage `#E4EAE3`, Graphite `#4F5A54`, Line `#C9CFC8`, Signal `#3FB97A`, Marshal `#E2531F` and text-safe Marshal `#B8400F`.
- **Typography (M4):** Archivo Variable for display/headings and numerals; IBM Plex Sans weights 400/500/600 for readable UI; IBM Plex Mono 500 for uppercase labels. Skala (px; size/line-height/tracking):

| Style | Desktop | Mobile | App |
|---|---:|---:|---:|
| Display | 172 / .84 / −0.04em / 125% | 64 / .84 / −0.04em / 125% | — |
| H1 | 84 / .92 / −0.035em / 122% | 40 / .92 / −0.035em / 122% | 28 / .92 / −0.035em / 122% |
| H2 | 48 / 1 / −0.02em / 118% | 30 / 1 / −0.02em / 118% | 22 / 1 / −0.02em / 118% |
| H3 | 26 / 1.1 / −0.01em / 112% | 21 / 1.1 / −0.01em / 112% | 18 / 1.1 / −0.01em / 112% |
| H4 | 20 / 1.3 / 0 | 17 / 1.3 / 0 | 15 / 1.3 / 0 |
| Body L | 20 / 1.5 / 0 | 17 / 1.5 / 0 | — |
| Body | 17 / 1.55 / 0 | 16 / 1.55 / 0 | 14 / 1.45 / 0 |
| Small | 14 / 1.5 / 0 | 14 / 1.5 / 0 | 13 / 1.5 / 0 |
| Button | 16 / 1 / 0 | 16 / 1 / 0 | 14 / 1 / 0 |
| Label | 12 / 1.4 / +0.08em | 11 / 1.4 / +0.08em | 11 / 1.4 / +0.08em |
| Numerals | 64–84 / .9 / 0 | 40–56 / .9 / 0 | 20 / .9 / 0 |
| Tabular data | 14 / 1.4 / 0 | 14 / 1.4 / 0 | 14 / 1.4 / 0 |

- **Spacing (A1):** 4, 8, 12, 16, 24, 32, 48 px.
- **Geometry (M6):** square corners; only radio controls and avatars may be round. Lines: section 2 px, group 1 px Ink, row 1 px Line. No shadows. Focus: 3 px Marshal outline with 3 px offset. Interactive target minimum: 44 × 44 px.
- **Motion (M6):** 120 ms reaction, 240 ms transition, 600 ms scene, 900 ms entrance. Brake easing `cubic-bezier(.2,0,0,1)` for appearance, launch easing `cubic-bezier(.7,0,.2,1)` for wipes/lines. Reduced-motion users receive effectively immediate transitions.

### Contrast allowlist (M3)

Only these text/background pairs are approved. Status colors also require a text label; Signal and Marshal are not decorative colors. White text is never placed on Marshal.

| Text | Background | Reference contrast | Level |
|---|---|---:|---|
| Ink | Ivory | 16.1:1 | AAA |
| Green | Ivory | 11.1:1 | AAA |
| Graphite | Ivory | 6.5:1 | AA |
| Marshal text `#B8400F` | White | 5.6:1 | AA |
| Ivory | Green | 11.1:1 | AAA |
| Mint | Green | 8.5:1 | AAA |
| Night | Mint | 11.5:1 | AAA |
| Ink | Marshal `#E2531F` | 4.6:1 | AA |

`packages/ui/src/__tests__/contrast.test.ts` recomputes every allowlisted pair using WCAG relative luminance and checks AA (4.5:1).

### Legacy application rules (M4)

Use uppercase only for Mono labels and the logo, never headings. Archivo wide is not used below 18 px or for body copy; condensed Archivo is for digits only. Use tabular numerals for table data, keep prose lines to at most 70 characters, and do not use italics.

### Legacy shared component rules (M6)

Use square geometry, prescribed line weights and no shadows. Keyboard focus is always visible. Controls meet the minimum target size; reduced motion suppresses animation. Statuses use one of the six named meanings (new, in progress, needs attention, done, rejected, not applicable), always with text, form, and color rather than color alone.

### Fonts and logo

All font files are served from the application bundle via Fontsource; OFL notices are in `packages/ui/licenses/`. Archivo Variable's `wdth.css` declares a 62–125% stretch axis and variable weight 100–900, so the required width and weight values are supported. The brand components and app-icon asset live in `packages/ui/src/brand/`; the four wordmark variants and the green/ivory app icon follow M2. The signet is sized to 1.7 times the font cap height (`cap`), and its adjacent Archivo wordmark uses 118% width, weight 800, and +0.03em tracking. The square app-icon master is `packages/ui/src/brand/app-icon.svg` (green field, ivory signet; M2 shows 160, 64, 32, and 16 px examples). Use signet-only below 24 px. M2 also captions a smallest logo with a 20 px signet; these source statements conflict, so this implementation follows the explicit below-24 px signet-only rule and does not infer a wordmark at 20 px. The text-rendered wordmark follows the HTML specimen; no claim is made that it is a curve-converted final master. See [`TRADEMARKS.md`](../../TRADEMARKS.md) for the separation of brand notice from software licensing.


### Browser verification

Rendered the package base styles and `Wordmark` in Chromium on 2026-10-30 at exact 320 px and 1440 px CSS viewports using the local app bundle. `document.fonts.check()` returned true for Archivo Variable, IBM Plex Sans, and IBM Plex Mono at both widths; the computed display face was Archivo Variable at 125% width, and the page had no horizontal overflow. The four logo variants computed to Green/Ivory, Mint signet + Ivory wordmark on Green, White on Ink, and Ink on Ivory respectively. This review used local assets only.

## Component library (A2 / F1)

`@nennbox/ui` is the single source for reusable app and registration controls.
Use the named exports from the package root and import
`@nennbox/ui/components.css` once in the application. Each primitive lives in
its own `packages/ui/src/<component>/` folder with implementation, token-based
styles, and a focused test. `components.tsx` and `components.css` are small
compatibility entrypoints only; they are not implementation files.

| Need | Component | Notes |
| --- | --- | --- |
| Actions and state | `Button`, `StatusLabel`, `HintLabel`, `Banner`, `Toast` | Status requires caller-provided human text; copy remains localizable. |
| Form controls | `TextInput`, `Textarea`, `DateInput`, `FileUpload`, `SelectField`, `Checkbox`, `Radio`, `Switch` | Labels, hints and errors are supplied by the application. |
| Form composition | `FormSection`, `Steps` | Fieldset sections and accessible progress labels. |
| Page composition | `PageHeader`, `FilterBar`, `Stack`, `Inline`, `EmptyState` | Layout only; no product-specific page behavior. |
| Navigation and details | `Tabs`, `Pagination`, `Disclosure`, `Menu` | Pass localized labels; tabs support arrow-key navigation. |
| Confirmation | `Dialog`, `Button` confirmation copy | Modal contents and all accessible names are caller-supplied. |
| Data | `DataField`, `DataTable`, `SelectionBar`, `Nameplate` | Prefer for repeated app data presentation. |

### Interaction primitive choice

The alternatives reviewed were Radix UI and React Aria. Neither is a current
runtime dependency, and adopting either would add a framework for behavior that
the required surfaces can express with browser primitives. The modal uses the
native `<dialog>.showModal()` modality (including focus containment, inert
background, and Escape cancellation); disclosures and the action menu use native
`<details>/<summary>` keyboard behavior. The tabs implement the small APG tab
pattern with roving tab index and Left/Right arrows; tests exercise the linked
tab-panel semantics. Styling remains in these components. If a future surface
needs nested composite widgets or more complex focus restoration, reevaluate
React Aria/Radix there rather than introducing a partial homegrown framework.

### Choosing a component

Start with the `/components` gallery for available variants and states, then use
these rules:

- Use `PageHeader` for a screen heading and contextual actions; don't recreate
  heading hierarchy or button groups in a feature.
- Use `FilterBar` around search/filter controls. Use `Tabs` only for sibling
  content views, not for a multi-step form; use `Steps` for progress.
- Use `TextInput`, `Textarea`, `DateInput`, or `FileUpload` instead of native
  controls. Supply every visible label, hint, error and announcement in the
  active locale.
- Use `Dialog` for confirmation or focused modal tasks and `Disclosure` for
  optional inline detail. `Banner` announces persistent feedback; `Toast` is for
  short-lived completion feedback.
- Use `EmptyState` when a collection is empty, `Pagination` for bounded result
  sets, and `Stack`/`Inline` for token-spaced composition.

A2 and F1 govern proportions, hierarchy, responsive control sizing and square
geometry. Tokens remain defined here rather than repeated in app styles; only
page-level layout belongs to `packages/app`.
