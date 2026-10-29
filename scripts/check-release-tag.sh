#!/usr/bin/env bash
# Fails unless the release tag is "v" followed by the package.json version, so a tag can never
# publish an image whose version label disagrees with its tag (ci-release plan, AC 7).
#
#   scripts/check-release-tag.sh v0.1.0
set -euo pipefail

cd "$(dirname "$0")/.."

tag="${1:?usage: scripts/check-release-tag.sh <tag>}"
expected="v$(node -p "require('./package.json').version")"

if [[ "$tag" != "$expected" ]]; then
  echo "check-release-tag: tag $tag does not match package.json ($expected)" >&2
  exit 1
fi
echo "check-release-tag: $tag matches package.json"
