# A kind cluster with one control-plane and one worker per zone (AD-003).

resource "kind_cluster" "this" {
  name            = var.cluster_name
  node_image      = var.node_image
  wait_for_ready  = true
  kubeconfig_path = abspath("${path.module}/.kubeconfig")

  kind_config {
    kind        = "Cluster"
    api_version = "kind.x-k8s.io/v1alpha4"

    # registries are configured per host under certs.d (see registry.tf)
    containerd_config_patches = [
      <<-TOML
      [plugins."io.containerd.cri.v1.images".registry]
        config_path = "/etc/containerd/certs.d"
      TOML
    ]

    node {
      role = "control-plane"

      # the Envoy NodePort, reachable from the host only
      extra_port_mappings {
        container_port = 30080
        host_port      = var.gateway_port
        listen_address = "127.0.0.1"
        protocol       = "TCP"
      }
    }

    dynamic "node" {
      for_each = var.zones
      content {
        role   = "worker"
        labels = { "topology.kubernetes.io/zone" = node.value }
      }
    }
  }
}
