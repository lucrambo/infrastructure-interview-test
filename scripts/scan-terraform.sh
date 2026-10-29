#!/usr/bin/env bash
# Trivy misconfiguration scan of a Terraform configuration (default deploy/terraform/aws): exits 1
# on any HIGH or CRITICAL finding not accepted, with its reason, in the directory's .trivyignore.
set -euo pipefail
# Git Bash on Windows would rewrite container paths
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/.."

dir="${1:-deploy/terraform/aws}"
root="$(pwd)"
if command -v cygpath >/dev/null 2>&1; then root="$(cygpath -w "$root")"; fi

# modules must be downloaded for Trivy to evaluate them; their bundled examples are not ours
terraform -chdir="$dir" init -backend=false -input=false >/dev/null
docker run --rm \
  -v "$root:/repo" -w /repo \
  -v posts-api-trivy-cache:/root/.cache \
  aquasec/trivy:0.76.1 config \
  --severity HIGH,CRITICAL --exit-code 1 --quiet \
  --ignorefile "$dir/.trivyignore" \
  --skip-dirs "$dir/.terraform/modules/*/examples" \
  "$dir"
