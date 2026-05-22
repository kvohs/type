# type

A single sheet of paper. You type, lines roll up and can't be edited, then you keep it or burn it. A tiny macOS writing app.

There is no cursor to scroll back to, no edit history, no autosave nagging at you. The line you are on is the only line you can touch. When you finish, you either save it as a Markdown file or burn it and walk away.

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
