# type

A single sheet of paper. You type, lines roll up and can't be edited, then you keep it or burn it. A tiny macOS writing app.

There is no cursor to scroll back to, no edit history, no autosave nagging at you. The line you are on is the only line you can touch. When you finish, you either save it as a Markdown file or burn it and walk away.

## Settings

Open settings with **Cmd+,**. Alongside the sound options you can turn on:

- **Dark mode / Amber** — light, soft dark, or an amber phosphor (CRT) look. Dark and Amber are mutually exclusive.
- **Zen mode** — go fullscreen, edge to edge. Just you and the page.
- **Stay on top** — keep the window above everything else (desktop app only).
- **Burn if I stop** — opt-in. Sit idle with words on the page and a warm glow creeps in from the edges; keep sitting and the whole sheet burns itself. Any keystroke cools it back down. Off by default — only catches fire if you ask it to.

A kept page is saved as a `.md` file with a small YAML frontmatter recording the date and word count, so it is self-dating. The in-progress sheet is also mirrored locally as you write, so an accidental quit or crash won't lose it — keeping or burning clears that mirror, so a draft only ever survives an unclean exit. There is still no history and nothing to scroll back to.

### Do Not Disturb / Focus

macOS has no public API to toggle Focus / Do Not Disturb, so `type` can't flip it silently. The supported route is Apple's **Shortcuts** app: create a shortcut with the *Set Focus* action and run it from the command line with `shortcuts run "Your Shortcut"`. A future version could fire that from the main process when Zen mode turns on. It is not wired up yet.

## Keyboard shortcuts

- **Return** — commit the current line and start the next one
- **Cmd+S** — keep it (saves the page as a `.md` file)
- **Cmd+Delete** — burn it
- **Ctrl+M** — mute (toggle the keystroke sound)
- **Cmd+,** — open settings
- **Esc** — close settings

## Run in dev

```
npm install && npm start
```

## Build the dmg

```
CSC_IDENTITY_AUTODISCOVERY=false npm run dist
```

This produces `dist/type-1.0.0-universal.dmg`, a universal (Apple Silicon and Intel) macOS build. It is unsigned, so on first launch macOS will warn you. Right-click (Control-click) the app, choose Open, then Open again to get past it.

## Download

Grab the latest build from the [releases page](https://github.com/kvohs/type/releases), or read more at [kellyvohs.com/type](https://kellyvohs.com/type).

## License

Personal project by Kelly Vohs. All rights reserved.
