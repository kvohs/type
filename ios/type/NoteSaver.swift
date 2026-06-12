import Foundation

// Kept pages land as plain .md files in iCloud Drive — the "type" folder in
// the Files app, synced by the user's own iCloud. No account, no backend.
// If iCloud is off (or still warming up), they land in the app's local
// Documents folder instead, which the Files app also shows ("On My iPhone").
enum NoteSaver {
    static func save(content: String, filename: String) {
        DispatchQueue.global(qos: .utility).async {
            let fm = FileManager.default
            let dir: URL
            if let ubiquity = fm.url(forUbiquityContainerIdentifier: nil) {
                dir = ubiquity.appendingPathComponent("Documents", isDirectory: true)
            } else {
                dir = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
            }
            do {
                try fm.createDirectory(at: dir, withIntermediateDirectories: true)
                let safe = filename.replacingOccurrences(of: "/", with: "-")
                try content.data(using: .utf8)?.write(to: dir.appendingPathComponent(safe), options: .atomic)
            } catch {
                NSLog("type saveNote failed: %@", error.localizedDescription)
            }
        }
    }
}
