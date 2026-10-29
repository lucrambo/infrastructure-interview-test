#!/usr/bin/env bash
# Builds, scans and publishes the posts-api container image (ADR-002, AD-005).
#
#   scripts/image.sh build   build posts-api:local for this machine's platform
#   scripts/image.sh scan    Hadolint on the Dockerfile and Trivy on the image; exit 1 on findings
#   scripts/image.sh push    build linux/amd64 and linux/arm64 and push <version> and sha-<commit>
#
# Environment: IMAGE_REPO (default docker.io/lrambo/posts-api), IMAGE (image to scan, default
# posts-api:local), DOCKERFILE (default Dockerfile), BUILDER (default posts-api-multiarch).
set -euo pipefail
# Git Bash on Windows would rewrite container paths such as /var/run/docker.sock
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/.."

IMAGE_REPO="${IMAGE_REPO:-docker.io/lrambo/posts-api}"
IMAGE="${IMAGE:-posts-api:local}"
DOCKERFILE="${DOCKERFILE:-Dockerfile}"
PLATFORMS="linux/amd64,linux/arm64"
BUILDER="${BUILDER:-posts-api-multiarch}"
HADOLINT_IMAGE="hadolint/hadolint:v2.15.1"
TRIVY_IMAGE="aquasec/trivy:0.76.1"

die() {
  echo "image.sh: $*" >&2
  exit 1
}

version() { node -p "require('./package.json').version"; }

build_args() {
  echo --build-arg "VERSION=$(version)" \
    --build-arg "REVISION=$(git rev-parse HEAD)" \
    --build-arg "CREATED=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

cmd_build() {
  # shellcheck disable=SC2046 # word splitting of build_args is intended
  docker buildx build --load $(build_args) --tag "$IMAGE" .
}

cmd_scan() {
  local failed=0
  echo "== Hadolint: $DOCKERFILE"
  docker run --rm -i "$HADOLINT_IMAGE" hadolint --failure-threshold warning - <"$DOCKERFILE" || failed=1
  echo "== Trivy: $IMAGE"
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v posts-api-trivy-cache:/root/.cache \
    "$TRIVY_IMAGE" image --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed \
    --exit-code 1 --no-progress "$IMAGE" || failed=1
  [[ $failed -eq 0 ]] || die "scan found issues"
}

cmd_push() {
  [[ -z "$(git status --porcelain)" ]] || die "the working tree has uncommitted changes; commit them first"
  local tag sha output
  tag="$(version)"
  # exactly 7 characters: --short grows the prefix when it is ambiguous
  sha="$(git rev-parse HEAD | cut -c1-7)"
  if output="$(docker buildx imagetools inspect "$IMAGE_REPO:$tag" 2>&1)"; then
    die "$IMAGE_REPO:$tag already exists; versions are immutable, bump the version in package.json"
  elif ! grep -qi "not found" <<<"$output"; then
    die "cannot tell whether $IMAGE_REPO:$tag exists: $output"
  fi
  # multi-platform images with attestations need a BuildKit container builder; host networking
  # lets it reach a registry on localhost too
  docker buildx inspect "$BUILDER" >/dev/null 2>&1 ||
    docker buildx create --name "$BUILDER" --driver docker-container --driver-opt network=host >/dev/null
  # shellcheck disable=SC2046 # word splitting of build_args is intended
  docker buildx build --builder "$BUILDER" --platform "$PLATFORMS" \
    --sbom=true --provenance=mode=max $(build_args) \
    --tag "$IMAGE_REPO:$tag" --tag "$IMAGE_REPO:sha-$sha" --push .
  echo "pushed $IMAGE_REPO:$tag and $IMAGE_REPO:sha-$sha"
}

case "${1:-}" in
  build) cmd_build ;;
  scan) cmd_scan ;;
  push) cmd_push ;;
  *) die "usage: scripts/image.sh build|scan|push" ;;
esac
