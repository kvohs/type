# Native-text rebuild — what you gain, what you lose

The spike (`prototype/native.html`) replaces the hand-rolled text engine with a
real `contenteditable` that iOS renders. The typewriter look is preserved as a
presentation layer on top (we only slide the paper to keep the active line on
the strike line). Proven working: platen roll + veil + mono column, with the OS
owning the text underneath.

This is the trade, ranked by how much it touches the soul of `type`.

---

## What you GAIN (the whole point — the hardening)

- **No more text bugs.** Double cursor, dragged word, "you→toy" scramble — all
  were artifacts of faking the text. They cannot happen here; there's nothing to
  reconcile.
- **Undo / redo.** Shake-to-undo and ⌘Z work. Today they don't — at 10k users,
  people *will* lose work and blame the app.
- **Autocorrect, predictive, QuickPath, dictation** — all native, no diffing.
- **Selection, copy/paste, the magnifier loupe, cursor-drag** — free.
- **Accessibility: VoiceOver, Dynamic Type, Voice Control.** Today the app is
  effectively unusable for blind/low-vision users. This fixes that. At scale
  it's also an App Store and legal expectation.
- **No keyboard-accessory swizzle.** We can drop the `object_setClass` hack that
  already broke typing once on iOS 26. One less thing an OS update can detonate.
- **Survives iOS updates.** We're standing on Apple's text stack, not fighting it.

---

## What you LOSE or must rebuild (the cost)

### 1. "You can't go back." — the core philosophy decision
Today, committed lines are **locked**: you can only ever type forward. That
constraint *is* the product ("No editing. You can't go back, so don't try.").
Native text lets you tap anywhere and edit. You can re-impose the lock, but it
means fighting the native caret/selection — the exact thing we're trying to stop
doing. **Realistic outcome: you gain full editing and lose the enforced "no
going back" rule.** This is the one decision only you can make. Everything else
is implementation.

### 2. Overstrike (↑ then `x` to strike over old lines)
No native equivalent. It's a bespoke interaction on locked text. **Most likely
dropped.** Could be rebuilt as a cosmetic overlay later, but not for free.

### 3. The fat block cursor
The signature solid block caret is replaced by iOS's thin blinking bar. You
can't make a native caret a block without faking it again (and a fake caret
fights the real one). **Lost, or it becomes a cosmetic compromise.**

### 4. Live markdown styling
Today `# `, `> `, `- ` snap to styled lines *as you type*. In a plaintext
contenteditable this is much harder (styling spans while editing reintroduces
some of the same fragility). **Likely simplified or deferred** — markdown still
saves fine in the `.md`, it just may not restyle live while writing.

### 5. The burnt-orange trailing period (the "type." dot)
Per-character coloring while editing is the kind of DOM surgery we're removing.
**Becomes cosmetic-only / on saved render, not live** — or dropped on the
writing surface.

### 6. Pixel-perfect platen determinism
Today the roll is computed from a fixed monospace column count — fully
deterministic. The native version syncs the roll to where iOS puts the caret. In
the common case it's smooth (proven). Edge cases — mid-paste, an autocorrect
popup, selecting a range, a floating/hardware keyboard — may need tuning to
avoid a small jump. **Mostly a polish cost, not a feature loss.**

### 7. The fixed measure + margin bell
The deliberate `MAX_COLS` wrap and the bell-near-the-margin lean on us
controlling layout. Native wraps by pixel width instead. **The bell and exact
column feel change** (can be re-approximated).

---

## What's a wash or actually better

- **Double-space → period**: iOS does this natively and correctly. We delete our
  buggy version. *Better.*
- **The intro/quote typing animation**: still works (type into the field
  programmatically). Minor rewire.
- **Keep / burn / the eject animation / kept-notes / settings**: untouched —
  those are presentation and already correct.
- **`.md` storage**: unchanged. Good format, stays.

---

## The honest summary

You lose three things with real soul attached: **the "can't go back" lock, the
overstrike mechanic, and the block cursor.** Everything else is either polish
to re-tune or a flat upgrade.

You gain: a writing app that doesn't corrupt text, supports undo, is accessible,
and won't break on the next iOS. For 10,000 people, that's not a feature trade —
it's the difference between a toy and something people can trust with their
words.

**My recommendation:** do the rebuild. Keep overstrike and the block cursor on a
"maybe later, as cosmetic overlays" list. The one thing to decide before we
start: **do we keep the "no going back" lock (and fight native a little to
enforce it), or do we let people edit freely and lean into native fully?** I'd
lean fully native and let the *ritual* (one sheet, keep or burn) carry the
"don't fuss over it" spirit instead of a hard lock.
