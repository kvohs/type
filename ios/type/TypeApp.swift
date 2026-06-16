import SwiftUI
import AVFoundation

// type for iPhone — a native shell around the same single sheet of paper
// the desktop app wraps. The web layer does all the writing; this side
// owns the keyboard chrome, iCloud saving, and the share of feedback.
@main
struct TypeApp: App {
    init() {
        // The typewriter sound is core, so it should follow the in-app Sound
        // toggle — not the hardware ringer switch. .playback ignores the silent
        // switch; .mixWithOthers leaves any music the user has on playing.
        try? AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @ObservedObject private var theme = ThemeStore.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TypeWebView()
            .ignoresSafeArea()
            .background(theme.bg)                              // last session's paper color
            .preferredColorScheme(theme.dark ? .dark : .light) // status bar legible on dark paper
            .onChange(of: scenePhase) { phase in
                // The audio session can come back deactivated after a
                // background trip (or an interruption), which left the
                // typewriter click silent on "every other" launch. Re-arm it
                // each time we're frontmost so the sound is always there.
                if phase == .active {
                    try? AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
                    try? AVAudioSession.sharedInstance().setActive(true)
                }
            }
    }
}
