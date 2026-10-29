# Cluster add-ons the application relies on: Gateway API with Envoy Gateway (ADR-003) and
# metrics-server for the HorizontalPodAutoscaler.

resource "helm_release" "envoy_gateway" {
  name             = "eg"
  chart            = "oci://docker.io/envoyproxy/gateway-helm"
  version          = var.envoy_gateway_version
  namespace        = "envoy-gateway-system"
  create_namespace = true
  wait             = true
  timeout          = 600
}

# GatewayClass, EnvoyProxy (NodePort 30080, 2 proxies across zones) and the Gateway `public`
resource "helm_release" "platform" {
  name      = "platform"
  chart     = "${path.module}/charts/platform"
  namespace = "envoy-gateway-system"
  wait      = true

  depends_on = [helm_release.envoy_gateway]
}

resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  version    = var.metrics_server_version
  namespace  = "kube-system"
  wait       = true

  # kind's kubelets serve self-signed certificates
  set = [{ name = "args[0]", value = "--kubelet-insecure-tls" }]

  depends_on = [kind_cluster.this]
}
