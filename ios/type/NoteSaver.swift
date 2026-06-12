import Foundation

// Kept pages land as plain .md files in iCloud Drive — the "type" folder in
// the Files app, synced by the user's own iCloud. No account, no backend.
// If iCloud is off (or still warming up), they land in the app's local
// Documents folder instead, which the Files app also shows ("On My iPhone").
#if DEBUG
// Debug-build diagnostics sink — one growing text file in local Documents,
// pulled off-device with `devicectl device copy from`. Not compiled in Release.
enum DiagLog {
    private static let queue = DispatchQueue(label: "type.diag")
    static func append(_ line: String) {
        queue.async {
            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("type-diag.log")
            let stamped = "\(Date()) \(line)\n"
            if let handle = try? FileHandle(forWritingTo: url) {
                handle.seekToEndOfFile()
                handle.write(stamped.data(using: .utf8)!)
                try? handle.close()
            } else {
                try? stamped.data(using: .utf8)!.write(to: url)
            }
        }
    }
}
#endif

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
