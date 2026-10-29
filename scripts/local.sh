#!/usr/bin/env bash
# Local Kubernetes environment: a kind cluster with workers in 3 zones, a highly available MySQL,
# Envoy Gateway and a private registry (deploy/terraform/local), the application deployed with
# its Helm chart, and the end-to-end scenarios in tests/e2e.
#
#   scripts/local.sh up       create or update the environment (terraform apply)
#   scripts/local.sh deploy   build the image, push it to the private registry, helm upgrade --install
#   scripts/local.sh test     run the functional, load and availability scenarios
#   scripts/local.sh down     destroy the environment (terraform destroy)
#   scripts/local.sh all      up, deploy and test
set -euo pipefail
# Git Bash on Windows would rewrite container paths
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/.."

TF_DIR="deploy/terraform/local"
RELEASE="posts"

usage() {
  echo "usage: scripts/local.sh up|deploy|test|down|all" >&2
  exit 2
}

die() {
  echo "local.sh: $*" >&2
  exit 1
}

require() {
  local tool
  for tool in "$@"; do
    command -v "$tool" >/dev/null 2>&1 || die "$tool is required on PATH"
  done
}

# Docker Desktop on Windows answers on a named pipe, not on the default Unix socket
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) export TF_VAR_docker_host="${TF_VAR_docker_host:-npipe:////./pipe/docker_engine}" ;;
esac

tf() { terraform -chdir="$TF_DIR" "$@"; }
out() { tf output -raw "$1"; }

cmd_up() {
  require docker kind terraform
  tf init -input=false >/dev/null
  tf apply -auto-approve -input=false
}

cmd_deploy() {
  require docker helm kubectl node terraform
  KUBECONFIG="$(out kubeconfig_path)"
  export KUBECONFIG

  local version sha tag push pull user pass config
  version="$(node -p "require('./package.json').version")"
  sha="$(git rev-parse HEAD | cut -c1-7)"
  tag="$version-$sha"
  [[ -z "$(git status --porcelain)" ]] || tag="$tag-dirty"
  push="$(out registry_push)"
  pull="$(out registry_pull)"
  user="$(out registry_username)"
  pass="$(out registry_password)"

  scripts/image.sh build
  docker tag posts-api:local "$push/posts-api:$tag"
  # a throwaway Docker config, so the registry password never lands in the user's one
  config="$(mktemp -d)"
  printf '%s' "$pass" | DOCKER_CONFIG="$config" docker login "$push" --username "$user" --password-stdin >/dev/null
  DOCKER_CONFIG="$config" docker push --quiet "$push/posts-api:$tag" >/dev/null
  rm -rf "$config"
  echo "pushed $push/posts-api:$tag"

  helm upgrade --install "$RELEASE" deploy/helm/posts-api \
    --namespace "$(out app_namespace)" \
    --values deploy/local/values.yaml \
    --set image.repository="$pull/posts-api" \
    --set image.tag="$tag" \
    --set imageCredentials.registry="$pull" \
    --set imageCredentials.username="$user" \
    --set-string imageCredentials.password="$pass" \
    --set database.host="$(out database_host)" \
    --set database.existingSecret="$(out database_secret)" \
    --wait --timeout 10m
  # on a first install the Deployment starts at 1 replica until the HPA raises it to its minimum
  kubectl --namespace "$(out app_namespace)" wait "deployment/$RELEASE-posts-api" \
    --for=jsonpath='{.status.readyReplicas}'=3 --timeout=5m
}

cmd_test() {
  require k6 kubectl node terraform docker helm
  yarn vitest run --project e2e
}

cmd_down() {
  require terraform
  tf destroy -auto-approve -input=false
}

case "${1:-}" in
  up) cmd_up ;;
  deploy) cmd_deploy ;;
  test) cmd_test ;;
  down) cmd_down ;;
  all)
    cmd_up
    cmd_deploy
    cmd_test
    ;;
  *) usage ;;
esac
