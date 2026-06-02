# AGENTS.md

Quick orientation for anyone (human or AI) working on this repo.

## What this is

type is a single-window macOS writing app. One sheet of paper: you type, the
lines roll up and can't be edited, then you keep it or burn it. Electron-
wrapped web app, distributed as a signed + notarized universal .dmg.

- **Repo:** github.com/kvohs/type
- **Live download:** kellyvohs.com/type → redirects to GitHub /latest/
- **Author:** Kelly Vohs

## File layout

```
type/
├── main.js           Electron main process (window, IPC, auto-update, share bridge)
├── preload.js        contextBridge exposing window.typeAPI to the renderer
├── index.html        everything else — UI, CSS, app logic in one inline <script>
├── quotes.js         curated quote list for the seeded opener
├── package.json      app metadata + electron-builder config
├── make-icon.py      icon generator → build/icon.icns + build/icon-1024.png
├── build/
│   ├── icon.icns           bundled into the .app at build time
│   ├── icon-1024.png       dev-mode dock icon
│   ├── icon.iconset/       per-size PNGs that iconutil packs into the .icns
│   ├── share.swift         source for the NSSharingServicePicker CLI helper
│   ├── type-share          compiled universal binary — bundled via extraResources
│   ├── icon.icns
│   └── entitlements.mac.plist
└── .github/workflows/release.yml   builds on tag push, signs + notarizes
```

All the real code lives in `index.html` (~1500 lines including inline CSS and
the single `<script>` block at the bottom). Don't be precious about that —
Kelly likes it as one file.

## The release loop

Kelly's contract: "I don't want to do any work at all. Agents handle it." So
agents own this end-to-end. From a change ready on `main`:

```
# 1. bump package.json "version" — patch for fixes, minor for features
# 2. add a new section at the TOP of CHANGELOG.md (under the v1.4.0 example):
#    - copy the format exactly (### New / ### Improved / ### Fixed)
#    - user-facing language, not commit-speak
# 3. commit, tag, push
git add -A && git commit -m "..."
git tag vX.Y.Z
git push origin main && git push origin vX.Y.Z

# 4. wait for the workflow (builds, signs, notarizes, drafts release ~5-10 min)
gh run watch -R kvohs/type

# 5. publish the draft with the CHANGELOG body
#    The CHANGELOG section IS the whole body. Don't append install steps or a
#    signing / notarization / auto-update footer — that's plumbing, not notes.
NOTES=$(awk '/^## v/{n++} n==1 && !/^## v/ && !/^---$/' CHANGELOG.md)   # body of newest section
gh release edit vX.Y.Z -R kvohs/type \
  --notes "$NOTES" --draft=false --latest
```

The auto-updater on running instances detects the new release within 5
seconds of launch (and every 6 hours after), downloads in the background,
and prompts the user on quit. No manual download needed.

The kellyvohs.com/type page fetches the latest 5 release bodies live from
the GitHub API and renders them below the copy — so once a release is
published with `--draft=false`, it appears there on the next page load. No
re-deploy of kellyvohs.com per release. The download button itself uses a
permanent redirect (`/type/download` → `releases/latest/download/...`).

## Signing + notarization

Already wired. Repo secrets at github.com/kvohs/type/settings/secrets/actions:

- `CSC_LINK` — base64 of the `.p12` (Developer ID Application cert + key)
- `CSC_KEY_PASSWORD` — password for the .p12 (stored in 1Password under
  "type .p12 password (Developer ID)" in the Watchcap vault)
- `APPLE_ID` — Apple ID email for the developer account
- `APPLE_APP_SPECIFIC_PASSWORD` — generated at appleid.apple.com
- `APPLE_TEAM_ID` — `CAKM5U4VR2`

Cert is good until **May 24, 2031**. No re-auth needed before then unless it's
revoked or the .p12 password is lost.

**Important:** when regenerating the .p12, use `openssl pkcs12 -export -legacy …`.
The `-legacy` flag matters — OpenSSL 3's default PKCS#12 encryption isn't
readable by macOS's `security import`, which silently breaks the build with
"MAC verification failed (wrong password?)" — misleading. Use legacy format.

## Local dev

```
npm install       # one-time
npm start         # launches Electron with dev dock icon
```

For unsigned local builds: `npm run dist:unsigned` (no notarization, no Apple
side — just outputs an unsigned .dmg in `dist/`). Use this for testing the
binary locally without burning a release.

## Icon

`python3 make-icon.py` regenerates:

- `build/icon-1024.png` (master)
- `build/icon.iconset/*.png` (10 sizes)
- `build/icon.icns` (packaged via iconutil)

Two gotchas baked into the script:

- `BOX` downsampling (not LANCZOS/BICUBIC) — Lanczos overshoots on
  high-contrast edges, creating a peach halo around the orange dot
- Dot has a darker outer ring at 80% interior brightness — pre-emphasis so
  macOS's display-time upscaling overshoot can't peak above the interior

If you change the icon design, keep both. Without them you'll see the halo.

## Swift share helper

`build/type-share` is a tiny CLI that presents `NSSharingServicePicker` (the
native AirDrop/Messages/Notes/Mail picker). Renderer renders the wallpaper
PNG, hands the path to this helper via IPC. Helper waits for the chosen
service to actually finish sharing before terminating — AirDrop in particular
needs the helper alive through the full transfer.

Recompile (after editing `build/share.swift`):

```
cd build && \
  swiftc -O -target arm64-apple-macos11 -o type-share-arm64 share.swift && \
  swiftc -O -target x86_64-apple-macos11 -o type-share-x86_64 share.swift && \
  lipo -create -output type-share type-share-arm64 type-share-x86_64 && \
  codesign --force --sign - type-share && \
  rm type-share-arm64 type-share-x86_64
```

The binary is committed (~200KB) and bundled into the .app via `extraResources`
in `package.json`. Also need `mac.x64ArchFiles: "Contents/Resources/type-share"`
in the build config — without it, electron-builder's universal-app merger sees
the fat binary in both arch builds, panics, and fails the build.

## Themes + defaults

Four themes (`body` classes, mutually exclusive): default (Light), `dark`,
`amber` (CRT phosphor), `dispatch` (WWII-era parchment). All four live in
`<style>` at the top of `index.html` and are just CSS variable overrides.

Default settings (from `DEFAULTS` in `index.html`):

- Light theme, Zen off, Stay-on-top off
- Smolder on (10s)
- Word count + Timer on
- Sound on, sub-sounds (clicks/carriage/bell) off
- Quote on startup + Quote on burn both on

If you change defaults, change `DEFAULTS`. Existing users keep their saved
prefs in localStorage; only first-launch is affected.

## Don't

- Don't add gimmicky chrome. The app's whole thesis is "one sheet of paper,
  no chrome." Kelly has pushed back on every loud button proposal.
- Don't propose schema rewrites or "let me clean this up" passes. The single-
  file index.html is intentional.
- Don't use LANCZOS for icon downsampling (see Icon section).
- Don't add cross-platform builds (Win/Linux) without an explicit ask. type
  is Mac-only by design.
- Don't pad release notes with plumbing. No install steps ("Download the dmg,
  drag to Applications…") and no signing / notarization / auto-update footer
  ("Signed with a Developer ID … notarized by Apple. Existing installs
  auto-update on next launch."). Existing users auto-update — they're not
  reinstalling — and every build is signed. Notes = what actually changed (the
  CHANGELOG section), nothing more.
