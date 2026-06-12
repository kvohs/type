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
    static func save(content: String, filename: String, completion: ((String) -> Void)? = nil) {
        DispatchQueue.global(qos: .utility).async {
            let fm = FileManager.default
            let safe = filename.replacingOccurrences(of: "/", with: "-")

            // 1) a folder the user picked (any place Files can reach) wins
            if let bookmark = UserDefaults.standard.data(forKey: "saveFolderBookmark") {
                var stale = false
                if let dir = try? URL(resolvingBookmarkData: bookmark, bookmarkDataIsStale: &stale),
                   dir.startAccessingSecurityScopedResource() {
                    defer { dir.stopAccessingSecurityScopedResource() }
                    if stale, let fresh = try? dir.bookmarkData() {
                        UserDefaults.standard.set(fresh, forKey: "saveFolderBookmark")
                    }
                    do {
                        try content.data(using: .utf8)?.write(to: dir.appendingPathComponent(safe), options: .atomic)
                        let name = UserDefaults.standard.string(forKey: "saveFolderName") ?? "your folder"
                        #if DEBUG
                        DiagLog.append("saved (picked folder): \(dir.path)/\(safe)")
                        #endif
                        DispatchQueue.main.async { completion?("folder:" + name) }
                        return
                    } catch {
                        NSLog("type saveNote: picked folder failed (%@), falling back", error.localizedDescription)
                    }
                }
            }

            // 2) iCloud Drive → type; 3) local Documents when iCloud is off
            let dir: URL
            let dest: String
            if let ubiquity = fm.url(forUbiquityContainerIdentifier: nil) {
                dir = ubiquity.appendingPathComponent("Documents", isDirectory: true)
                dest = "icloud"
            } else {
                dir = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
                dest = "local"
            }
            do {
                try fm.createDirectory(at: dir, withIntermediateDirectories: true)
                let url = dir.appendingPathComponent(safe)
                try content.data(using: .utf8)?.write(to: url, options: .atomic)
                #if DEBUG
                DiagLog.append("saved (\(dest)): \(url.path)")
                #endif
                DispatchQueue.main.async { completion?(dest) }
            } catch {
                NSLog("type saveNote failed: %@", error.localizedDescription)
                #if DEBUG
                DiagLog.append("save FAILED: \(error.localizedDescription)")
                #endif
            }
        }
    }
}
