import Foundation

func check(_ text: String, valid: Bool) {
    let result = URL(string: text).flatMap { try? LinkTarget($0) }
    precondition((result != nil) == valid, "Unexpected result for \(text)")
}
check("dsh-link://session/abc_123-XYZ", valid: true)
check("dsh-link://session/abc?instance=550e8400-e29b-41d4-a716-446655440000", valid: true)
check("dsh-link://session/" + String(repeating: "a", count: 128), valid: true)
for bad in [
    "https://session/abc", "dsh-link://user@session/abc", "dsh-link://session:3000/abc",
    "dsh-link://session/abc#fragment", "dsh-link://session/", "dsh-link://session/abc/def",
    "dsh-link://session/..", "dsh-link://session/%2Ftmp", "dsh-link://session/a%00b",
    "dsh-link://session/abc?token=secret", "dsh-link://session/abc?instance=nope",
    "dsh-link://session/abc?instance=550e8400-e29b-41d4-a716-446655440000&instance=550e8400-e29b-41d4-a716-446655440000",
    "dsh-link://session/" + String(repeating: "a", count: 129)
] { check(bad, valid: false) }
print("LinkTarget parser tests passed")
