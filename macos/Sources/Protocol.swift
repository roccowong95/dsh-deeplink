import Foundation
import CryptoKit
import Darwin

struct LinkTarget: Equatable {
    let sessionId: String
    let instanceId: String?
    init(_ url: URL) throws {
        guard url.absoluteString.utf8.count <= 2048,
              let c = URLComponents(url: url, resolvingAgainstBaseURL: false),
              c.scheme == "dsh-link", c.host == "session", c.user == nil,
              c.password == nil, c.port == nil, c.fragment == nil,
              c.path.hasPrefix("/"), c.path.count > 1 else { throw BridgeError.invalidLink }
        let id = String(c.path.dropFirst())
        guard id.utf8.count <= 128, !id.contains("/"),
              id.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-").contains($0) }),
              id != ".", id != ".." else { throw BridgeError.invalidLink }
        let q = c.queryItems ?? []
        guard q.count <= 1, q.allSatisfy({ $0.name == "instance" && UUID(uuidString: $0.value ?? "") != nil }) else { throw BridgeError.invalidLink }
        sessionId = id; instanceId = q.first?.value?.lowercased()
    }
}

enum BridgeError: LocalizedError {
    case invalidLink, message(String)
    var errorDescription: String? {
        switch self {
        case .invalidLink: return "Invalid link. Expected dsh-link://session/SESSION_ID (optional ?instance=UUID)."
        case .message(let s): return s
        }
    }
}

struct Instance: Decodable {
    let schemaVersion: Int
    let instanceId: String
    let port: Int
    let token: String
    let pid: Int
    let createdAt: String
    var base: URL { URL(string: "http://127.0.0.1:\(port)")! }
}

struct Status: Decodable { let requestId: String?; let status: String; let error: String? }
struct Identity: Decodable { let instanceId: String; let proof: String }

final class Bridge {
    private let session: URLSession
    private let decoder = JSONDecoder()
    init() {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 2
        config.timeoutIntervalForResource = 3
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.connectionProxyDictionary = [:]
        session = URLSession(configuration: config, delegate: NoRedirect(), delegateQueue: nil)
    }
    func cancel() { session.invalidateAndCancel() }
    private func privatePath(_ url: URL, directory: Bool) -> Bool {
        guard let a = try? FileManager.default.attributesOfItem(atPath: url.path),
              (a[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
              let mode = a[.posixPermissions] as? NSNumber,
              mode.intValue & 0o077 == 0,
              a[.type] as? FileAttributeType == (directory ? .typeDirectory : .typeRegular) else { return false }
        return true
    }
    func instances() -> [Instance] {
        let root = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/DSH Deeplink/instances", isDirectory: true)
        guard privatePath(root.deletingLastPathComponent(), directory: true), privatePath(root, directory: true),
              let files = try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) else { return [] }
        let dates = ISO8601DateFormatter()
        dates.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let candidates = files.compactMap { url -> (Instance, Date)? in
            guard url.pathExtension == "json", privatePath(url, directory: false),
                  let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 8192,
                  let data = try? Data(contentsOf: url), let i = try? decoder.decode(Instance.self, from: data),
                  i.schemaVersion == 1, UUID(uuidString: i.instanceId) != nil,
                  (1...65535).contains(i.port), i.pid > 0, i.pid <= Int(Int32.max), i.token.count == 64,
                  i.token.allSatisfy({ $0.isHexDigit }),
                  let created = dates.date(from: i.createdAt) else { return nil }
            // Drop dead hosts; PID reuse still requires the HMAC handshake below.
            guard Darwin.kill(Int32(i.pid), 0) == 0 || errno == EPERM else { return nil }
            return (i, created)
        }
        // Limit after validation/sorting: old crash files cannot occupy the first 128 slots.
        return candidates.sorted { $0.1 > $1.1 }.prefix(128).map { $0.0 }
    }
    private func send(_ request: URLRequest) async throws -> Data {
        let (bytes, response) = try await session.bytes(for: request)
        defer { bytes.task.cancel() }
        guard let r = response as? HTTPURLResponse, (200...299).contains(r.statusCode),
              response.expectedContentLength <= 65536 else {
            throw BridgeError.message("Plugin rejected the request or returned an invalid response.")
        }
        // Content-Length may be absent or untrusted; cap decoded bytes while streaming.
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            guard data.count < 65536 else { throw BridgeError.message("Plugin response exceeds 64 KiB.") }
            data.append(byte)
        }
        return data
    }
    func authenticate(_ i: Instance) async -> Bool {
        let nonce = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        let request = URLRequest(url: i.base.appendingPathComponent("v1/identity").appendingQuery("nonce", nonce))
        guard let data = try? await send(request), let identity = try? decoder.decode(Identity.self, from: data),
              identity.instanceId == i.instanceId else { return false }
        return identityProofIsValid(identity.proof, token: i.token, nonce: nonce, instanceId: i.instanceId)
    }
    func open(_ target: LinkTarget, instance i: Instance) async throws {
        guard await authenticate(i) else { throw BridgeError.message("Plugin identity changed; request not sent.") }
        let id = UUID().uuidString.lowercased()
        var request = URLRequest(url: i.base.appendingPathComponent("v1/open"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(i.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["requestId": id, "sessionId": target.sessionId])
        _ = try await send(request)
        let deadline = Date().addingTimeInterval(30)
        while Date() < deadline {
            try Task.checkCancellation()
            var poll = URLRequest(url: i.base.appendingPathComponent("v1/requests/\(id)"))
            poll.setValue("Bearer \(i.token)", forHTTPHeaderField: "Authorization")
            let status = try decoder.decode(Status.self, from: await send(poll))
            guard status.requestId == nil || status.requestId == id else { throw BridgeError.message("Mismatched plugin response.") }
            switch status.status {
            case "opened": return
            case "failed", "cancelled": throw BridgeError.message(status.error ?? "DSH could not open this session.")
            case "queued", "claimed": break
            default: throw BridgeError.message("Unknown plugin response.")
            }
            try await Task.sleep(nanoseconds: 300_000_000)
        }
        throw BridgeError.message("DSH did not confirm navigation within 30 seconds. It may still finish; check DSH before retrying.")
    }
}

// Internal for deterministic cross-language protocol tests; never logs the token.
func identityProofIsValid(_ hexProof: String, token: String, nonce: String, instanceId: String) -> Bool {
    // Token is the manifest's ASCII hex string, not hex-decoded bytes.
    let expected = Data(HMAC<SHA256>.authenticationCode(
        for: Data("\(nonce):\(instanceId)".utf8),
        using: SymmetricKey(data: Data(token.utf8))))
    guard let proof = Data(hex: hexProof), proof.count == expected.count else { return false }
    return zip(proof, expected).reduce(UInt8(0)) { $0 | ($1.0 ^ $1.1) } == 0
}

private final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
private extension URL {
    func appendingQuery(_ name: String, _ value: String) -> URL {
        var c = URLComponents(url: self, resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: name, value: value)]
        return c.url!
    }
}
private extension Data {
    init?(hex: String) {
        guard hex.count == 64 else { return nil }
        var bytes = [UInt8](); var index = hex.startIndex
        while index < hex.endIndex {
            let next = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<next], radix: 16) else { return nil }
            bytes.append(byte); index = next
        }
        self.init(bytes)
    }
}
