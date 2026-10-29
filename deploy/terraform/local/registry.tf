# A private registry with htpasswd authentication, on the kind network so nodes reach it by
# name. The host pushes to 127.0.0.1:<registry_port>; pods pull <name>:5000/... with a secret.

locals {
  registry_name = "${var.cluster_name}-registry"
  registry_user = "posts-api"
}

resource "random_password" "registry" {
  length  = 32
  special = false
}

resource "docker_image" "registry" {
  name         = "registry:3.1.2"
  keep_locally = true
}

resource "docker_container" "registry" {
  name    = local.registry_name
  image   = docker_image.registry.image_id
  restart = "unless-stopped"

  env = [
    "REGISTRY_AUTH=htpasswd",
    "REGISTRY_AUTH_HTPASSWD_REALM=${local.registry_name}",
    "REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd",
  ]

  upload {
    file = "/auth/htpasswd"
    # bcrypt_hash is stable across plans, unlike the bcrypt() function
    content = "${local.registry_user}:${random_password.registry.bcrypt_hash}\n"
  }

  ports {
    internal = 5000
    external = var.registry_port
    ip       = "127.0.0.1"
  }

  # created by kind with the cluster
  networks_advanced {
    name = "kind"
  }

  depends_on = [kind_cluster.this]
}

# containerd on every node reaches the registry over HTTP inside the kind network
resource "null_resource" "registry_mirror" {
  triggers = {
    cluster  = kind_cluster.this.id
    registry = docker_container.registry.id
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = <<-EOT
      set -euo pipefail
      export MSYS_NO_PATHCONV=1
      dir="/etc/containerd/certs.d/${local.registry_name}:5000"
      for node in $(kind get nodes --name "${var.cluster_name}"); do
        docker exec "$node" mkdir -p "$dir"
        printf '[host."http://%s:5000"]\n' "${local.registry_name}" | docker exec -i "$node" cp /dev/stdin "$dir/hosts.toml"
      done
    EOT
  }
}
