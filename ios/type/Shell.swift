import SwiftUI
import UIKit

// The typewriter's physical presence: keystrokes tick, the carriage return
// lands a little heavier, keep and burn resolve with a notification thump.
enum Haptics {
    private static let key = UIImpactFeedbackGenerator(style: .light)
    private static let carriage = UIImpactFeedbackGenerator(style: .medium)
    private static let moment = UINotificationFeedbackGenerator()

    static func play(_ kind: String) {
        DispatchQueue.main.async {
            switch kind {
            case "return": carriage.impactOccurred(intensity: 0.8)
            case "keep":   moment.notificationOccurred(.success)
            case "burn":   moment.notificationOccurred(.warning)
            default:       key.impactOccurred(intensity: 0.55)
            }
        }
    }
}

// The page tells the shell its paper color whenever the theme changes; the
// shell remembers it across launches so the backdrop and status bar match
// the theme from the first frame instead of flashing white at dark users.
final class ThemeStore: ObservableObject {
    static let shared = ThemeStore()
    @Published var bg: Color
    @Published var dark: Bool

    private init() {
        let hex = UserDefaults.standard.string(forKey: "shellBG") ?? "#ffffff"
        bg = Color(UIColor(typeHex: hex))
        dark = UserDefaults.standard.bool(forKey: "shellDark")
    }

    func apply(bgHex: String, dark: Bool) {
        bg = Color(UIColor(typeHex: bgHex))
        self.dark = dark
        UserDefaults.standard.set(bgHex, forKey: "shellBG")
        UserDefaults.standard.set(dark, forKey: "shellDark")
    }
}

extension UIColor {
    // #rgb / #rrggbb, forgiving about the leading hash
    convenience init(typeHex: String) {
        var s = typeHex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        var v: UInt64 = 0
        guard s.count == 6, Scanner(string: s).scanHexInt64(&v) else {
            self.init(white: 1, alpha: 1); return
        }
        self.init(
            red: CGFloat((v >> 16) & 0xff) / 255,
            green: CGFloat((v >> 8) & 0xff) / 255,
            blue: CGFloat(v & 0xff) / 255,
            alpha: 1
        )
    }
}
