#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
[[ $(uname -s) == Darwin ]] || { echo 'Swift/CryptoKit tests require macOS.' >&2; exit 1; }
mkdir -p build/tests
xcrun swiftc -swift-version 5 Sources/Protocol.swift Tests/main.swift -o build/tests/protocol-tests
build/tests/protocol-tests
