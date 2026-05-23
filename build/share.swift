// type-share: tiny CLI that presents NSSharingServicePicker for one or more files.
// Usage: type-share /path/to/file [/path/to/other ...]
//
// Recompile after editing this file:
//   cd build && \
//     swiftc -O -target arm64-apple-macos11 -o type-share-arm64 share.swift && \
//     swiftc -O -target x86_64-apple-macos11 -o type-share-x86_64 share.swift && \
//     lipo -create -output type-share type-share-arm64 type-share-x86_64 && \
//     codesign --force --sign - type-share && \
//     rm type-share-arm64 type-share-x86_64
//
// The compiled binary is committed (build/type-share) and bundled by
// electron-builder via extraResources in package.json.
//
// Lifecycle: stays alive until the chosen service actually finishes sharing
// (didShareItems / didFailToShareItems), or the user dismisses the picker
// without choosing. AirDrop in particular needs the helper to remain
// running through the entire transfer — its sheet is a child of our anchor
// window, so terminating early kills it.

import Cocoa

// kept at file scope so the run loop holds references for the whole session
var anchorWindow: NSWindow!
let pickerDelegate = ShareDelegate()
var sharingPicker: NSSharingServicePicker!

final class ShareDelegate: NSObject, NSSharingServicePickerDelegate, NSSharingServiceDelegate {

    // route the picker to use us as the delegate for whichever service the user picks
    func sharingServicePicker(_ picker: NSSharingServicePicker,
                              delegateFor sharingService: NSSharingService) -> NSSharingServiceDelegate? {
        return self
    }

    // fires when user clicks a service in the picker (or dismisses it).
    // we DO NOT terminate here on a real choice — the chosen service still
    // has work to do (AirDrop transfer, Messages compose, etc.).
    func sharingServicePicker(_ picker: NSSharingServicePicker,
                              didChoose service: NSSharingService?) {
        if service == nil {
            // picker was dismissed without picking anything
            terminate(after: 0.15)
        }
        // otherwise: wait for didShareItems / didFailToShareItems
    }

    // AirDrop / Messages / etc. finished successfully
    func sharingService(_ sharingService: NSSharingService,
                        didShareItems items: [Any]) {
        terminate(after: 0.4)
    }

    // user cancelled the chosen service's sheet (or it errored)
    func sharingService(_ sharingService: NSSharingService,
                        didFailToShareItems items: [Any],
                        error: Error) {
        terminate(after: 0.2)
    }

    // tell AirDrop which window to anchor its sheet from
    func sharingService(_ sharingService: NSSharingService,
                        sourceWindowForShareItems items: [Any],
                        sharingContentScope: UnsafeMutablePointer<NSSharingService.SharingContentScope>) -> NSWindow? {
        return anchorWindow
    }

    private func terminate(after seconds: TimeInterval) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
            NSApplication.shared.terminate(nil)
        }
    }
}

// ---------- main ----------

let args = CommandLine.arguments
guard args.count > 1 else {
    FileHandle.standardError.write("usage: type-share <file> [<file> ...]\n".data(using: .utf8)!)
    exit(1)
}

let urls: [URL] = args.dropFirst().map { URL(fileURLWithPath: $0) }
for u in urls where !FileManager.default.fileExists(atPath: u.path) {
    FileHandle.standardError.write("missing: \(u.path)\n".data(using: .utf8)!)
    exit(2)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

// invisible 1pt window anchored near the mouse — picker popover renders
// next to the cursor, and AirDrop's sheet attaches to this same window.
let mouse = NSEvent.mouseLocation
anchorWindow = NSWindow(
    contentRect: NSRect(x: mouse.x, y: mouse.y, width: 1, height: 1),
    styleMask: [.borderless],
    backing: .buffered,
    defer: false
)
anchorWindow.level = .floating
anchorWindow.isOpaque = false
anchorWindow.backgroundColor = .clear
anchorWindow.alphaValue = 0.0
anchorWindow.ignoresMouseEvents = true
anchorWindow.makeKeyAndOrderFront(nil)

NSApp.activate(ignoringOtherApps: true)

sharingPicker = NSSharingServicePicker(items: urls)
sharingPicker.delegate = pickerDelegate

DispatchQueue.main.async {
    sharingPicker.show(relativeTo: .zero, of: anchorWindow.contentView!, preferredEdge: .minY)
}

// safety net: if the user leaves a service sheet open forever, bail after 10 min
DispatchQueue.main.asyncAfter(deadline: .now() + 600) {
    NSApplication.shared.terminate(nil)
}

app.run()
