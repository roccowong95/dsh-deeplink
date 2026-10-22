#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
ARCH=${1:-arm64}
./build.sh "$ARCH"
APP="$PWD/build/$ARCH/DSH Deeplink.app"
ZIP="$PWD/build/DSH-Deeplink-0.1.0-$ARCH-adhoc.zip"
codesign --verify --strict "$APP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
shasum -a 256 "$ZIP" > "$ZIP.sha256"
printf 'Release: %s\nAd-hoc signed; NOT notarized. Gatekeeper may block it.\n' "$ZIP"
