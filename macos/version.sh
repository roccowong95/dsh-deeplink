#!/bin/bash
set -euo pipefail
VERSION=${1:-$(cat "$(dirname "$0")/VERSION")}
if [[ ! "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo 'Companion version must be stable MAJOR.MINOR.PATCH (no leading zeroes).' >&2
  exit 1
fi
printf '%s\n' "$VERSION"
