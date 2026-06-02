# Changelog

All notable changes to **type** are listed here, newest first. Each release
section becomes the body of the matching GitHub Release, which the in-app
auto-updater and kellyvohs.com/type both read from.

---

## v1.5.0

### Improved
- **Markdown lines read like the real thing.** A line that starts with `> `, `- ` / `* `, or `# ` now hides the literal marker as you write — a quote shows just its left rule, a list item gets a real • bullet, a heading simply goes bold. The markers still live in the file underneath, so your saved `.md` stays valid and byte-faithful; they're only tucked out of sight on screen. Wrapped list and heading lines keep their shape through resize and reload.
- **The pointer gets out of your way.** The mouse cursor now hides itself while you're typing, so it stops hovering in the middle of the page when you tab back from another app. Any nudge of the mouse brings it right back.

### Fixed
- **Editing a list, quote, or heading line from above works again.** Pressing ↑ to step back onto an earlier line and type over it used to break on any `- `, `> `, or `# ` line: the cursor landed on the now-hidden marker, became invisible, and keystrokes piled up on top of themselves — sometimes quietly mangling the line. The cursor now skips past the marker to the first real character, stays visible, and leaves the marker untouched.

---

## v1.4.2

### Fixed
- **Keeping a long page rolls it up, not down.** On a page taller than the window, ⌘S used to shove the sheet *downward* a moment before it vanished, instead of pulling it up and off the platen. The eject now lifts from wherever the page is scrolled to, so a kept page always rolls up and away like paper leaving a typewriter — and the date stamp lands on the clean platen behind it. Short pages behave exactly as before.

---

## v1.4.1

### Improved
- **Launch feels intentional.** The window now stays hidden until first paint is ready, then appears with the "type." wordmark animation running from the top. No more white flash, no more catching the intro mid-animation — the window opening *is* the wordmark reveal.
- **Window dragging in small sizes.** Added an invisible drag region along the top of the window so you can always grab and move it, even at narrow widths where there's no chrome to grab onto.

### Fixed
- **No more mid-word splits on resize.** A word like "how" used to occasionally render as "ho / w" when the window was sized just-so. The CSS now only breaks mid-word as a last resort, and the column math has a touch more headroom so the JS-wrapped lines reliably fit the visual container.
- **Seeded opening quotes re-center on resize.** Previously only your own typing reflowed when you resized the window; the quote on launch stayed at its original wrap, drifting left when the window grew. The quote now reflows with you, preserving body / attribution styling.

---

## v1.4.0

### New
- **Markdown styling.** Lines starting with `> `, `- ` / `* `, or `# ` get gentle visual treatment — italic block quotes with a left rule, hanging-indent bullets, bolder headings. Strictly line-level: `**bold**` and `_italic_` inside a line don't render, so the typewriter grid stays intact and your `.md` export is byte-identical to what you typed.
- **Pages counter.** New toggle in settings alongside word count and timer. 250 words per page — the manuscript / morning-pages convention.

### Improved
- **Resize keeps the page centered.** When you stretch the window, committed lines re-wrap to the new width so your writing stays centered instead of stranded against the left edge. Blank-line paragraph breaks are preserved.
- **Save animation.** The page now pulls off the platen with a "pull then rip" curve — gentle engagement, then a fast finish. The date stamp lands on a clean empty platen instead of fading in over the lifting page.
- **Burn animation.** Smoke puffs removed. Characters fade in place (no per-char jitter). Sparks redesigned to feel like real campfire embers — fire-orange across every theme, glide along curved paths instead of going straight, spawn from across the burning text, with a couple of lingerers that hang on after the rest fade.

### Fixed
- `⌥⌫` (delete previous word) now keeps the space before the deleted word. It used to eat the space too.

---

## v1.3.9 and earlier

See the [GitHub Releases page](https://github.com/kvohs/type/releases) for older release notes.
