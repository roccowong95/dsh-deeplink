#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
ARCH=${1:-arm64}
VERSION=$(bash ./version.sh "${2:-}")
bash ./build.sh "$ARCH" "$VERSION"
APP="$PWD/build/$ARCH/DSH Deeplink.app"
ZIP="$PWD/build/DSH-Deeplink-$VERSION-$ARCH-adhoc.zip"
codesign --verify --strict "$APP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
(cd "$(dirname "$ZIP")" && shasum -a 256 "$(basename "$ZIP")" > "$(basename "$ZIP").sha256")
printf 'Release: %s\nAd-hoc signed; NOT notarized. Gatekeeper may block it.\n' "$ZIP"
