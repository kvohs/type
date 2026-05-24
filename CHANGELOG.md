# Changelog

All notable changes to **type** are listed here, newest first. Each release
section becomes the body of the matching GitHub Release, which the in-app
auto-updater and kellyvohs.com/type both read from.

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
