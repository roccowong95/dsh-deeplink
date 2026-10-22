import AppKit
import UniformTypeIdentifiers

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var item: NSStatusItem!
    private let menu = NSMenu()
    private let status = NSMenuItem(title: "Ready", action: nil, keyEquivalent: "")
    private var work: Task<Void, Never>?
    private let bridge = Bridge()

    func applicationDidFinishLaunching(_ notification: Notification) {
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "link", accessibilityDescription: "DSH Deeplink")
        item.button?.toolTip = "DSH Deeplink"
        menu.addItem(status)
        menu.addItem(.separator())
        let choose = NSMenuItem(title: "Choose DSH.app…", action: #selector(chooseApp), keyEquivalent: "")
        choose.target = self; menu.addItem(choose)
        let about = NSMenuItem(title: "About DSH Deeplink", action: #selector(showAbout), keyEquivalent: "")
        about.target = self; menu.addItem(about)
        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit DSH Deeplink", action: #selector(quit), keyEquivalent: "q")
        quit.target = self; menu.addItem(quit)
        item.menu = menu // AppKit supports both left and right clicks.
    }
    func application(_ application: NSApplication, open urls: [URL]) {
        guard urls.count == 1 else { showError("Open one session link at a time."); return }
        do {
            let target = try LinkTarget(urls[0])
            guard work == nil else { showError("A session link is already being processed. Wait for it to finish."); return }
            status.title = "Opening session…"
            work = Task { [weak self] in
                guard let self else { return }
                defer { self.work = nil }
                do {
                    try await self.launchDSH()
                    let deadline = Date().addingTimeInterval(30)
                    var live: [Instance] = []
                    repeat {
                        try Task.checkCancellation()
                        live = []
                        for i in self.bridge.instances() {
                            if Date() >= deadline { break }
                            if let wanted = target.instanceId, i.instanceId.lowercased() != wanted { continue }
                            if await self.bridge.authenticate(i) { live.append(i) }
                        }
                        if !live.isEmpty { break }
                        try await Task.sleep(nanoseconds: 500_000_000)
                    } while Date() < deadline
                    guard !live.isEmpty else { throw BridgeError.message("No matching DSH Deeplink plugin became ready within 30 seconds. Install/enable both plugin components in DSH, then retry.") }
                    let instance = try self.select(live)
                    try await self.bridge.open(target, instance: instance)
                    self.status.title = "Session opened"
                } catch is CancellationError { self.status.title = "Cancelled" }
                catch { self.status.title = "Could not open session"; self.showError(error.localizedDescription) }
            }
        } catch { showError(error.localizedDescription) }
    }
    private func select(_ instances: [Instance]) throws -> Instance {
        if instances.count == 1 { return instances[0] }
        let alert = NSAlert()
        alert.messageText = "Choose a DSH instance"
        alert.informativeText = "Multiple plugins are running. No instance will be selected automatically. Match the ID shown by your plugin."
        let picker = NSPopUpButton(frame: NSRect(x: 0, y: 0, width: 420, height: 28))
        picker.addItems(withTitles: instances.map { "\($0.instanceId) (PID \($0.pid))" })
        alert.accessoryView = picker; alert.addButton(withTitle: "Open"); alert.addButton(withTitle: "Cancel")
        NSApp.activate(ignoringOtherApps: true)
        guard alert.runModal() == .alertFirstButtonReturn else { throw CancellationError() }
        return instances[picker.indexOfSelectedItem]
    }
    @objc private func chooseApp() {
        let panel = NSOpenPanel()
        panel.title = "Choose the DSH Desktop application"
        panel.message = "Choose your trusted official DSH Desktop app. This helper never downloads or installs DSH."
        panel.canChooseDirectories = false; panel.canChooseFiles = true; panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.applicationBundle]
        NSApp.activate(ignoringOtherApps: true)
        if panel.runModal() == .OK, let url = panel.url, Bundle(url: url)?.bundleIdentifier != nil {
            UserDefaults.standard.set(url.path, forKey: "DSHApplicationPath")
        }
    }
    private func launchDSH() async throws {
        var path = UserDefaults.standard.string(forKey: "DSHApplicationPath")
        if path == nil { chooseApp(); path = UserDefaults.standard.string(forKey: "DSHApplicationPath") }
        guard let path, let bundle = Bundle(path: path), bundle.bundleIdentifier != Bundle.main.bundleIdentifier,
              bundle.bundleURL.pathExtension == "app" else { throw BridgeError.message("Choose a trusted DSH Desktop app from the menu first.") }
        let config = NSWorkspace.OpenConfiguration(); config.activates = true
        _ = try await NSWorkspace.shared.openApplication(at: bundle.bundleURL, configuration: config)
    }
    @objc private func showAbout() {
        let alert = NSAlert(); alert.messageText = "DSH Deeplink"
        alert.informativeText = "Unofficial lightweight session-link helper. Quitting stops this helper, not DSH. Already accepted requests may still finish. Opening a dsh-link URL can launch the helper again. Distributed with an ad-hoc signature; not Apple-notarized."
        alert.runModal()
    }
    private func showError(_ message: String) {
        let alert = NSAlert(); alert.alertStyle = .warning; alert.messageText = "DSH Deeplink"; alert.informativeText = message
        NSApp.activate(ignoringOtherApps: true); alert.runModal()
    }
    @objc private func quit() { work?.cancel(); bridge.cancel(); NSApp.terminate(nil) }
    func applicationWillTerminate(_ notification: Notification) { work?.cancel(); bridge.cancel() }
}
@main
struct DSHDeeplinkApplication {
    @MainActor
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        withExtendedLifetime(delegate) { app.run() }
    }
}
