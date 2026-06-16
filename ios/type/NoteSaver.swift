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

    // ---- reading kept pages (for the kept-notes review screen) ----
    // Resolve the folder pages actually live in, mirroring save()'s order:
    // a folder the user picked → iCloud Drive → type → local Documents.
    // Returns the directory and, when it's the security-scoped picked folder,
    // that same URL so the caller can stop accessing it when done.
    private static func keptDir() -> (dir: URL, scoped: URL?)? {
        let fm = FileManager.default
        if let bookmark = UserDefaults.standard.data(forKey: "saveFolderBookmark") {
            var stale = false
            if let dir = try? URL(resolvingBookmarkData: bookmark, bookmarkDataIsStale: &stale),
               dir.startAccessingSecurityScopedResource() {
                return (dir, dir)
            }
        }
        if let ubiquity = fm.url(forUbiquityContainerIdentifier: nil) {
            return (ubiquity.appendingPathComponent("Documents", isDirectory: true), nil)
        }
        return (fm.urls(for: .documentDirectory, in: .userDomainMask)[0], nil)
    }

    // Split a kept .md into its YAML frontmatter (date / kept / words) and body.
    private static func parseNote(_ text: String) -> (dateISO: String?, kept: String?, words: Int, body: String) {
        var dateISO: String?, kept: String?, words: Int?
        var body = text
        if text.hasPrefix("---") {
            let lines = text.components(separatedBy: "\n")
            var end = -1
            var i = 1
            while i < lines.count {
                let line = lines[i]
                if line.trimmingCharacters(in: .whitespaces) == "---" { end = i; break }
                if line.hasPrefix("date:") { dateISO = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces) }
                else if line.hasPrefix("kept:") { kept = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces) }
                else if line.hasPrefix("words:") { words = Int(String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)) }
                i += 1
            }
            if end >= 0 {
                let rest = Array(lines[(end + 1)...]).drop(while: { $0.trimmingCharacters(in: .whitespaces).isEmpty })
                body = rest.joined(separator: "\n")
            }
        }
        body = body.trimmingCharacters(in: .whitespacesAndNewlines)
        let wc = words ?? body.split(whereSeparator: { $0 == " " || $0 == "\n" || $0 == "\t" }).count
        return (dateISO, kept, wc, body)
    }

    // type-YYYY-MM-DD-HH-MM.md → "YYYY-MM-DD", a fallback when frontmatter is absent.
    private static func isoFromFilename(_ name: String) -> String? {
        let comps = name.replacingOccurrences(of: ".md", with: "").split(separator: "-")
        if comps.count >= 4, comps[0] == "type" { return "\(comps[1])-\(comps[2])-\(comps[3])" }
        return nil
    }

    static func list(completion: @escaping ([[String: Any]]) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            guard let (dir, scoped) = keptDir() else { DispatchQueue.main.async { completion([]) }; return }
            defer { scoped?.stopAccessingSecurityScopedResource() }
            let fm = FileManager.default
            let urls = (try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])) ?? []
            var out: [[String: Any]] = []
            for url in urls where url.pathExtension.lowercased() == "md" {
                guard let text = try? String(contentsOf: url, encoding: .utf8) else { continue }
                let p = parseNote(text)
                var item: [String: Any] = ["filename": url.lastPathComponent, "body": p.body, "words": p.words]
                if let iso = p.dateISO ?? isoFromFilename(url.lastPathComponent) { item["dateISO"] = iso }
                if let kept = p.kept { item["kept"] = kept }
                out.append(item)
            }
            // newest first by day, then by filename — filenames now carry the
            // full HH-MM-SS, so two pages kept the same day still order by time.
            out.sort {
                let a = ($0["dateISO"] as? String ?? ""), b = ($1["dateISO"] as? String ?? "")
                if a != b { return a > b }
                return ($0["filename"] as? String ?? "") > ($1["filename"] as? String ?? "")
            }
            DispatchQueue.main.async { completion(out) }
        }
    }

    static func read(filename: String, completion: @escaping (String) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            guard !filename.isEmpty, let (dir, scoped) = keptDir() else { DispatchQueue.main.async { completion("") }; return }
            defer { scoped?.stopAccessingSecurityScopedResource() }
            let text = (try? String(contentsOf: dir.appendingPathComponent(filename), encoding: .utf8)) ?? ""
            let body = parseNote(text).body
            DispatchQueue.main.async { completion(body) }
        }
    }

    // burn = delete the file for good. The press-and-hold on the page is the
    // confirmation; there is no trash, same as burning a page while writing.
    static func delete(filename: String, completion: @escaping (Bool) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            guard !filename.isEmpty, let (dir, scoped) = keptDir() else { DispatchQueue.main.async { completion(false) }; return }
            defer { scoped?.stopAccessingSecurityScopedResource() }
            let ok = (try? FileManager.default.removeItem(at: dir.appendingPathComponent(filename))) != nil
            DispatchQueue.main.async { completion(ok) }
        }
    }

    // copy a kept page to a temp file so the share sheet has a stable .md URL
    // that outlives the security-scoped access to the source folder.
    static func tempCopy(filename: String) -> URL? {
        guard !filename.isEmpty, let (dir, scoped) = keptDir() else { return nil }
        defer { scoped?.stopAccessingSecurityScopedResource() }
        guard let data = try? Data(contentsOf: dir.appendingPathComponent(filename)) else { return nil }
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        try? data.write(to: tmp, options: .atomic)
        return tmp
    }
}
