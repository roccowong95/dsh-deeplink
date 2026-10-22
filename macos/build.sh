#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
[[ $(uname -s) == Darwin ]] || { echo 'Requires macOS and Xcode Command Line Tools.' >&2; exit 1; }
ARCH=${1:-arm64}
[[ "$ARCH" == arm64 || "$ARCH" == x86_64 || "$ARCH" == universal ]] || { echo 'Usage: build.sh [arm64|x86_64|universal]' >&2; exit 1; }
OUT="$PWD/build/$ARCH"
APP="$OUT/DSH Deeplink.app"
mkdir -p "$APP/Contents/MacOS"
cp Info.plist "$APP/Contents/Info.plist"
SDK=$(xcrun --sdk macosx --show-sdk-path)
compile() { xcrun swiftc -O -swift-version 5 -sdk "$SDK" -target "$1-apple-macos12.0" -framework AppKit -framework CryptoKit Sources/Protocol.swift Sources/main.swift -o "$OUT/DSHDeeplink-$1"; }
if [[ "$ARCH" == universal ]]; then
  compile arm64; compile x86_64
  lipo -create "$OUT/DSHDeeplink-arm64" "$OUT/DSHDeeplink-x86_64" -output "$APP/Contents/MacOS/DSHDeeplink"
else
  compile "$ARCH"; cp "$OUT/DSHDeeplink-$ARCH" "$APP/Contents/MacOS/DSHDeeplink"
fi
# User-approved ad-hoc release: no Developer ID identity, no notarization claim.
codesign --force --sign - "$APP"
codesign --verify --strict --verbose=2 "$APP"
printf '\nBuilt ad-hoc signed (NOT notarized): %s\n' "$APP"
