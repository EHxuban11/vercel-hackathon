// Phone Jail Blocker — macOS menu bar app.
// Slave to the web app: polls Supabase for an active focus session; while one
// is running it kills distracting tabs in Chrome, plays the disappointed-dad
// voice, and logs the violation to the shared Wall of Shame.

import Cocoa

let BLOCKED_SITES = [
    "youtube.com", "reddit.com", "twitter.com", "x.com", "instagram.com",
    "tiktok.com", "twitch.tv", "netflix.com", "facebook.com",
]

let TAB_PHRASES = [
    "Switching tabs? Was YouTube calling your name again?",
    "I saw that. You left. In the middle of a focus session.",
    "Reddit will still be there in twenty minutes. Your deadline won't.",
    "Welcome back. Your productivity left while you were gone.",
    "Every tab you open is a little betrayal. I felt this one.",
]

struct ActiveSession {
    let id: String
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var statusMenuItem: NSMenuItem!
    private var pollTimer: Timer?
    private var sweepTimer: Timer?
    private var activeSession: ActiveSession?
    private var lastViolation = Date.distantPast
    private var audioDir: URL!

    private var userName: String {
        get { UserDefaults.standard.string(forKey: "userName") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "userName") }
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "📵"

        let menu = NSMenu()
        statusMenuItem = NSMenuItem(title: "Checking…", action: nil, keyEquivalent: "")
        menu.addItem(statusMenuItem)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Set name…", action: #selector(setName), keyEquivalent: "n"))
        menu.addItem(NSMenuItem(title: "Open Phone Jail", action: #selector(openApp), keyEquivalent: "o"))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem.menu = menu

        audioDir = FileManager.default.temporaryDirectory.appendingPathComponent("phone-jail-audio")
        try? FileManager.default.createDirectory(at: audioDir, withIntermediateDirectories: true)
        prefetchAudio()

        if userName.isEmpty { setName() }

        pollTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.poll() }
        sweepTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.sweepTabs() }
        // .common keeps them firing while the status-bar menu is open
        RunLoop.main.add(pollTimer!, forMode: .common)
        RunLoop.main.add(sweepTimer!, forMode: .common)
        poll()
    }

    @objc func openApp() {
        NSWorkspace.shared.open(URL(string: Config.appURL)!)
    }

    @objc func setName() {
        let alert = NSAlert()
        alert.messageText = "Phone Jail name"
        alert.informativeText = "Use the same name as on \(Config.appURL)"
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 220, height: 24))
        field.stringValue = userName
        alert.accessoryView = field
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Cancel")
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertFirstButtonReturn {
            userName = field.stringValue.trimmingCharacters(in: .whitespaces)
            poll()
        }
    }

    // MARK: - Supabase

    private func supabaseRequest(path: String, method: String = "GET", body: Data? = nil) -> URLRequest {
        var req = URLRequest(url: URL(string: "\(Config.supabaseURL)\(path)")!)
        req.httpMethod = method
        req.setValue(Config.supabaseKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(Config.supabaseKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        return req
    }

    private func parseTimestamp(_ s: String?) -> Date? {
        guard let s else { return nil }
        let withFrac = ISO8601DateFormatter()
        withFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFrac.date(from: s) { return d }
        // Postgres omits fractional seconds when they're exactly zero
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: s)
    }

    private func poll() {
        guard !userName.isEmpty else { update(session: nil, label: "Set your name first") ; return }
        var comps = URLComponents(string: "\(Config.supabaseURL)/rest/v1/sessions")!
        comps.queryItems = [
            URLQueryItem(name: "user_name", value: "eq.\(userName)"),
            URLQueryItem(name: "ended_at", value: "is.null"),
            URLQueryItem(name: "select", value: "id,started_at,planned_minutes"),
            URLQueryItem(name: "order", value: "started_at.desc"),
            URLQueryItem(name: "limit", value: "1"),
        ]
        let path = comps.url!.absoluteString.replacingOccurrences(of: Config.supabaseURL, with: "")
        URLSession.shared.dataTask(with: supabaseRequest(path: path)) { [weak self] data, _, _ in
            guard let self else { return }
            var session: ActiveSession?
            if let data,
               let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
               let row = rows.first,
               let id = row["id"] as? String {
                // safety valve: stop blocking if the session was never ended.
                // Unparseable timestamp → fail open (treat as expired), never block forever.
                let planned = row["planned_minutes"] as? Double ?? 25
                if let started = self.parseTimestamp(row["started_at"] as? String),
                   Date().timeIntervalSince(started) < (planned + 10) * 60 {
                    session = ActiveSession(id: id)
                }
            }
            DispatchQueue.main.async {
                self.update(session: session,
                            label: session != nil ? "Focus session active — blocking 🔒" : "No active session — sites free")
            }
        }.resume()
    }

    private func update(session: ActiveSession?, label: String) {
        activeSession = session
        statusMenuItem.title = label
        statusItem.button?.title = session != nil ? "📵🔒" : "📵"
    }

    private func logViolation(sessionId: String) {
        let payload: [String: Any] = ["session_id": sessionId, "user_name": userName, "kind": "tab"]
        guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return }
        URLSession.shared.dataTask(
            with: supabaseRequest(path: "/rest/v1/violations", method: "POST", body: body)
        ).resume()
    }

    // MARK: - Tab killing

    private func sweepTabs() {
        guard let session = activeSession else { return }
        // anchor on host boundaries: "://site/" or ".site/" — plain "contains site"
        // would match dropbox.com for x.com, youtube.community, URLs with the site in the path…
        let conditions = BLOCKED_SITES
            .map { "(u contains \"://\($0)/\" or u contains \".\($0)/\")" }
            .joined(separator: " or ")
        let script = """
        set killed to 0
        tell application "Google Chrome"
            if it is running then
                repeat with w in windows
                    try
                        set tabCount to count of tabs of w
                        repeat with i from tabCount to 1 by -1
                            set u to URL of tab i of w
                            if \(conditions) then
                                close tab i of w
                                set killed to killed + 1
                            end if
                        end repeat
                    end try
                end repeat
            end if
        end tell
        return killed
        """
        DispatchQueue.global().async { [weak self] in
            guard let self else { return }
            let proc = Process()
            proc.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            proc.arguments = ["-e", script]
            let pipe = Pipe()
            proc.standardOutput = pipe
            proc.standardError = Pipe()
            try? proc.run()
            proc.waitUntilExit()
            let out = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "0"
            let killed = Int(out.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
            if killed > 0 {
                DispatchQueue.main.async { self.busted(sessionId: session.id) }
            }
        }
    }

    private func busted(sessionId: String) {
        guard Date().timeIntervalSince(lastViolation) > 15 else { return }
        lastViolation = Date()
        logViolation(sessionId: sessionId)
        playShame()
    }

    // MARK: - Voice

    private func prefetchAudio() {
        for i in 1...5 {
            let dest = audioDir.appendingPathComponent("tab-\(i).mp3")
            guard !FileManager.default.fileExists(atPath: dest.path) else { continue }
            URLSession.shared.downloadTask(with: URL(string: "\(Config.appURL)/audio/tab-\(i).mp3")!) { tmp, _, _ in
                if let tmp { try? FileManager.default.moveItem(at: tmp, to: dest) }
            }.resume()
        }
    }

    private func playShame() {
        let i = Int.random(in: 1...5)
        let mp3 = audioDir.appendingPathComponent("tab-\(i).mp3")
        if FileManager.default.fileExists(atPath: mp3.path) {
            let proc = Process()
            proc.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
            proc.arguments = [mp3.path]
            try? proc.run()
        } else {
            // macOS built-in "Daniel" — fittingly, also a disappointed British man
            let proc = Process()
            proc.executableURL = URL(fileURLWithPath: "/usr/bin/say")
            proc.arguments = ["-v", "Daniel", TAB_PHRASES[i - 1]]
            try? proc.run()
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
