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

## Build an unsigned dmg (quick, dev only)

```
npm run dist:unsigned
```

This produces `dist/type-1.0.0-universal.dmg`, a universal (Apple Silicon and Intel) macOS build. It is unsigned, so on first launch macOS will warn you. Right-click (Control-click) the app, choose Open, then Open again to get past it.

## Build a signed + notarized dmg (for distribution)

The project is configured for hardened runtime, entitlements, code signing, and
notarization (`package.json` → `build.mac` and `build/entitlements.mac.plist`).
You must run this **on a Mac** — `codesign`, `notarytool`, and `stapler` are
macOS-only — and you need an Apple Developer Program membership.

### One-time prerequisites

1. **Developer ID Application certificate** installed in your login keychain.
   Create it in Xcode (Settings → Accounts → Manage Certificates → +) or from
   the [Apple Developer portal](https://developer.apple.com/account/resources/certificates),
   then double-click the `.cer` to import. Verify it is present:
   ```
   security find-identity -v -p codesigning
   ```
   You should see a line like `"Developer ID Application: Kelly Vohs (TEAMID)"`.
2. **App-specific password** for notarytool: create one at
   [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security →
   App-Specific Passwords.
3. **Team ID**: the 10-character code in parentheses from step 1 (also on the
   Apple Developer membership page).

### Build

```
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="XXXXXXXXXX"

npm run dist
```

electron-builder will sign the app with your Developer ID, upload it to Apple
with notarytool, wait for the ticket, and staple it to the `.app` and `.dmg`.
The first notarization can take a few minutes.

> Using an App Store Connect API key instead of an Apple ID? Set
> `APPLE_API_KEY` (path to the `.p8`), `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`
> rather than the three vars above. If your electron-builder version rejects
> `"notarize": true`, change it to `"notarize": { "teamId": "XXXXXXXXXX" }`.

### Verify it worked

```
spctl -a -vvv -t install "dist/mac-universal/type.app"   # → "accepted, source=Notarized Developer ID"
codesign -dv --verbose=4 "dist/mac-universal/type.app"    # confirms hardened runtime + identity
xcrun stapler validate "dist/type-1.0.0-universal.dmg"    # → "The validate action worked!"
```

If `spctl` says *accepted* and the source is *Notarized Developer ID*, the dmg
is ready to ship — users won't see the Gatekeeper warning.

## Download

Grab the latest build from the [releases page](https://github.com/kvohs/type/releases), or read more at [kellyvohs.com/type](https://kellyvohs.com/type).

## License

Personal project by Kelly Vohs. All rights reserved.
