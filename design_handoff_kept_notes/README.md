# Handoff: `type` — Kept Notes review + search

## Overview

This adds **one new capability** to the existing `type` writing app: a way to **review pages you've already kept**, plus **search** over them. Until now you could write a page and keep it (saved as a `.md` file) or burn it — but there was no way back to a kept page. This design is that way back.

**Scope is deliberately narrow.** We are *adding a screen and a search*, not redesigning the app. The writing experience — the single sheet, the lines rolling up, keep/burn, the themes — **does not change at all.** Read the "Do not break" section below before touching anything.

---

## About the design files

The files in this bundle are a **design reference prototype written in HTML/CSS/JS** (React + Babel, for build speed). They show the intended look and behavior. **They are not production code to paste in.**

`type`'s real app is a **single-file vanilla-JS web app** (`index.html`, one inline `<script>`) wrapped in a WKWebView (`ios/type/TypeWebView.swift`) and Electron on macOS. The task is to **re-implement this kept-notes screen in that existing vanilla single-file style** — *not* to introduce React/Babel into `index.html`. Match the codebase's patterns (the existing theme tokens, the `--mono`/Courier type, the `body.dark`/`body.amber`/etc. theme classes, the existing keystroke/layout helpers).

**Fidelity: high.** Colors, type, spacing, motion, and interactions are final. Recreate them faithfully using the app's existing tokens.

---

## ⚠️ Do NOT break what exists

These are the existing-app invariants. The new feature must not alter any of them:

1. **The writing screen is untouched.** The single sheet, lines rolling up and becoming un-editable, the strike point, the caret, smolder, word/timer stats, the seeded quote — all unchanged.
2. **The bottom wordmark stays as-is.** On the writing screen, `type.` sits centered in the bottom hint bar between **keep** and **burn**, with `pointer-events: none` so taps pass through to the keyboard field. Keep that. The **only** addition here is: **press-and-hold** that wordmark to reveal the kept screen (a long-press gesture; a normal tap still raises the keyboard to write).
3. **Keep / burn while writing are unchanged** (`⌘S` / `⌘⌫`, the YAML-frontmatter `.md` save in `NoteSaver.swift`, the burn animation).
4. **Themes are unchanged.** Reuse the four existing theme token sets exactly (Light = default, Dark, Amber CRT, Dispatch). This design defaults to **Light**. Do not change existing theme defaults or the `DEFAULTS` object beyond what the feature needs.
5. **Single-file, no new chrome.** Per `AGENTS.md`: don't add gimmicky chrome, don't introduce a framework, keep it one file. The kept screen is new surface — its chrome (top-left `type.`, hamburger, search) lives **only on the kept screen**, never bleeding onto the writing sheet.
6. **Do not add React/Babel/build steps.** Port the logic to vanilla JS.

If a choice in this prototype would force a change to any of the above, prefer the existing behavior. The prototype's job is to specify the *new* screen, not to relitigate the old one.

---

## What's actually new (the whole feature)

1. **An entry gesture** — press-and-hold the bottom `type.` wordmark on the writing screen → the writing sheet rolls down and the kept screen rolls up.
2. **The kept screen** — your kept pages on a horizontal "roll." Flick through them; **tap** a page to open it full; **press-and-hold** a page to burn it.
3. **A bottom red index line** — your thumb rest, your position indicator, your scrubber, and your date readout, all in one quiet mark.
4. **Search** — a magnifier (top-right) opens a quiet field that filters kept pages live.
5. **A Swift bridge** to **list** and **read** the kept `.md` files (today the app can only *write* them).

---

## Screens / views

### 1. Writing screen (existing — small changes)
- **Opens blank**: just the `type.` wordmark centered at the bottom. **No welcome copy and no "tap to write / hold" hint** — discovery is intentional; the app's point is writing, not archiving.
- **Long-press the bottom `type.` wordmark** → transition to the kept screen. Tap = write (existing). A subtle fill/underline under the wordmark indicates the hold progressing (~440 ms).
- **Settings is a hamburger, top-right** (changed from the old gear) — opens the same settings drawer used on the kept screen. It hides once the keyboard is up.
- keep / burn remain at the bottom edges as today.

### 2. Kept screen — "the roll"
- **Purpose:** browse and read kept pages.
- **Top bar** (kept screen only): left = `type.` wordmark (tap → a **fresh writing draft**); right = a **magnifier** (search) and a **hamburger** (settings). Icons are quiet (`--ink-faint`, hover `--ink-quiet`), ~17px, stroke 1.4–1.5.
- **The pages:** full **sheets** (a kept page is a whole sheet — never resized/cropped to its word count). Cards are `--panel`, 1px `--rule` hairline border, radius 4px, soft shadow `0 8px 22px -6px rgba(0,0,0,.18)`, inner top emboss. ~318px wide on a 402px screen, ~84% of the vertical roll area tall. Header = date stamp (`21 MAY 2026`, mono bold, 13px, letter-spacing .26em), a 30px×1px `--ink-faint` rule, then the body (Courier 13.5px, line-height 1.82). The body has a **bottom fade mask** (`linear-gradient(180deg,#000 82%,transparent)`) so a long note reads as "more below," and a short note simply has blank lower sheet (correct — you don't cut the paper).
- **Carousel motion:** pages sit on a cylindrical focal plane — neighbors scale down, rotateY, recede in Z, and dim (`translateZ`, `rotateY ±26°`, `scale → .74`, opacity → .16). Center page is focused. Inertial drag with friction .935, snap-to-page. Hard flicks accelerate (×1.7) for big archives.
- **Bottom index line** (see below).

### 3. The bottom red index line
- A **short, centered** horizontal scale (spans the central ~44% of the width; do **not** make it full-width — it reads as a typewriter's center index, not a scrollbar edge).
- A 1px `--ink-faint` track; a 2px×13px **burnt-orange** (`--mark`) tick that **moves with position** (newest toward the left of the scale, oldest toward the right).
- It is also the **scrubber**: dragging it horizontally traverses the *entire* archive (full scale = full roll). Direct page-drag handles fine steps.
- A **date readout** floats just above the tick and follows it: the **month + year** at rest (faint, `--ink-quiet`, opacity .4), **coarsening to just the year** (larger, `--ink-soft`) while you scrub fast, settling back to the month when you slow. This is the fast-scroll index for a large archive.

### 4. Opened page (read)
- **Tap** a focused card → it expands to a full-bleed reading view (fade+scale in, .26s `cubic-bezier(.2,.7,.3,1)`). Comfortable type (Courier 15px, line-height 2.0), scrollable if long. Date stamp + rule at top; `61 words · kept 21 may 2026` foot. **Share** glyph top-right (opens a small share sheet: send `.md` / copy text / messages). A **down-chevron** circle bottom-center closes it.

### 5. Burn (gesture, no button)
- **Press-and-hold a focused card** (~820 ms). An ember grows from the card's base (`radial-gradient(...,rgba(255,110,30,.55))`); at full hold it ignites — text → ember → char, sparks rise, the page fades and is removed from the roll. A scroll cancels the hold. **Open question for product:** burning a kept page should presumably **delete the `.md` file** — confirm that's intended (it's destructive and irreversible). Consider a confirm, or treat the long-press itself as the confirmation.

### 6. Search
- Magnifier (top-right) → a quiet field below the header (mono 14px, hairline underline, magnifier prefix, live result count, `×` to close). Filters kept pages by body text + date. No match → a calm "no kept page matches." In production this filters over the **listed `.md` files** (see bridge).

### 7. Settings drawer
- Hamburger (top-right) → a Dispatch-style drawer slides in from the right: **paper theme** swatches (Light / Dark / Amber / Dispatch) + a one-line reminder ("tap a page to open it · hold a page to burn it · drag the red line to travel"). Theme writes the existing theme class on `<body>`.

### 8. Empty / first run
- No kept notes yet → a single centered sheet: "nothing kept yet. / the pages you keep roll onto here." (Kept minimal per product direction.)

---

## Interactions & behavior

- **Long-press wordmark** (writing) → kept; **tap wordmark** (writing) → keyboard. **Tap `type.`** (kept top-left) → fresh draft.
- **Drag pages** horizontally = scroll (inertial, snap). **Tap focused page** = open. **Tap non-focused page** = glide it to center. **Hold focused page** = burn.
- **Drag the bottom line** = scrub the whole archive. Tick + date follow position live.
- **Haptics:** a soft detent **once per page** crossed, and a confirm beat on burn. In the prototype these are `navigator.vibrate(...)` calls — **replace with real iOS haptics** (`UIImpactFeedbackGenerator .soft` for the detent, a `.notification`/pattern for burn) via the Swift side. `navigator.vibrate` does **not** fire in WKWebView/iOS Safari. Respect the system Haptics + Reduce-Motion toggles.
- **Transitions:** writing↔kept roll (write leaf slides down + fades, kept leaf rises from below, ~.6s `cubic-bezier(.2,.7,.3,1)`). Reduce-Motion: skip the teaching/decorative motion.

## State

- `archive` (list of kept notes, newest-first), `screen` (write|kept), `opened` (note|null), `burningId`, `searching` + `query`, `theme`. Scroll `pos` is a float page-index driven by rAF (inertia/snap); the center index derives from `round(pos)`.

## Design tokens (Light = default; reuse the app's existing sets)

```
Light (default):   --paper:#ffffff  --ink:#121316  --ink-soft:#2c2d32
  --ink-quiet:#7c7f86  --ink-faint:#c2c4c9  --rule:#e5e6e9  --panel:#ffffff
  --emboss:rgba(255,255,255,.8)  --accent/red:#df5a26  --panel-shadow:rgba(40,36,30,.4)
Dark:     --paper:#141519 --ink:#e7e8ea --ink-soft:#c4c6cb --ink-quiet:#888b92 --ink-faint:#3f424a --rule:#2a2c32 --panel:#1c1e23 --accent:#df5a26
Amber:    --paper:#161009 --ink:#d69a4a --ink-soft:#b37e3a --ink-quiet:#835f30 --ink-faint:#463210 --rule:#352712 --panel:#1c1509 --accent:#d9883a
Dispatch: --paper:#e7dcc1 --ink:#2a2418 --ink-soft:#463d2a --ink-quiet:#7a6e52 --ink-faint:#ad9f7c --rule:#cdc09c --panel:#f1e8d0 --accent:#9c3a2a
```
Type: `"Courier Prime", "Courier New", ui-monospace, monospace`. The one accent (the burnt-orange red) appears in exactly a few places: the wordmark period, the bottom index tick, and active states. No other hues.

## The Swift bridge (the one piece of real plumbing needed)

Today `NoteSaver.swift` only **writes** `.md` files (to the picked folder, else iCloud `Documents`, else local `Documents`). The kept screen needs two read operations, exposed to the web layer the same way writes are (e.g. via `window.typeAPI` / `WKScriptMessageHandler`):

- **list** → return kept files: filename, and parse the YAML frontmatter (`date:` ISO, `kept:` human stamp, `words:`). Sort newest-first.
- **read(filename)** → return the file body (strip frontmatter for display; keep it for share/export).

Search and the date readout run off that list (date from `kept:`/`date:`, text match over the body). When the bridge is absent (e.g. macOS not yet wired, or first run mid-iCloud-sync), the screen should degrade gracefully (empty state), never crash.

## Assets

None. All visuals are type, hairline rules, and inline SVG (magnifier, hamburger, share, close chevron) — redraw at matching stroke weights. No image files, no icon font, no emoji.

## Files in this bundle

- `Kept Notes.html` — the runnable reference prototype (open in a browser).
- `kept/app.jsx` — screen orchestration, transition, archive, search, settings drawer.
- `kept/platen.jsx` — the roll: pages, carousel physics, tap-open / hold-burn, the bottom index line + date readout, burn animation, share sheet.
- `kept/writing.jsx` — the writing-screen entry (long-press wordmark) — **reference only**; the real writing screen already exists in `index.html`, do not replace it.
- `kept/data.jsx` — sample notes + date formatting (`19 MAY`, `MAY 2026`, `19 MAY 2026`). Sample data only — real data comes from the bridge.
- `ios-frame.jsx`, `tweaks-panel.jsx` — **prototype scaffolding only** (device bezel + the design-time theme toggle). Not part of the feature; do not port.
