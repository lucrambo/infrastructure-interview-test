# Cluster add-ons, as locally: the AWS Load Balancer Controller provisions the NLB in front of
# Envoy Gateway (ADR-003), metrics-server feeds the HPA, External Secrets syncs secrets from
# AWS Secrets Manager. Controllers get AWS permissions through EKS Pod Identity.

module "lb_controller_identity" {
  source  = "terraform-aws-modules/eks-pod-identity/aws"
  version = "~> 2.10"

  name                            = "${var.name}-aws-lb-controller"
  attach_aws_lb_controller_policy = true

  associations = {
    this = {
      cluster_name    = module.eks.cluster_name
      namespace       = "kube-system"
      service_account = "aws-load-balancer-controller"
    }
  }
}

module "external_secrets_identity" {
  source  = "terraform-aws-modules/eks-pod-identity/aws"
  version = "~> 2.10"

  name                                  = "${var.name}-external-secrets"
  attach_external_secrets_policy        = true
  external_secrets_secrets_manager_arns = [aws_secretsmanager_secret.app.arn, aws_rds_cluster.mysql.master_user_secret[0].secret_arn]
  external_secrets_kms_key_arns         = [aws_kms_key.database.arn]
  external_secrets_create_permission    = false

  associations = {
    this = {
      cluster_name    = module.eks.cluster_name
      namespace       = "external-secrets"
      service_account = "external-secrets"
    }
  }
}

resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = var.aws_load_balancer_controller_version
  namespace  = "kube-system"
  wait       = true

  values = [yamlencode({
    clusterName    = module.eks.cluster_name
    region         = var.region
    vpcId          = module.vpc.vpc_id
    replicaCount   = 2
    serviceAccount = { name = "aws-load-balancer-controller" }
  })]

  depends_on = [module.lb_controller_identity]
}

resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  version    = var.metrics_server_version
  namespace  = "kube-system"
  wait       = true

  values = [yamlencode({ replicas = 2 })]

  depends_on = [module.eks]
}

resource "helm_release" "external_secrets" {
  name             = "external-secrets"
  repository       = "https://charts.external-secrets.io"
  chart            = "external-secrets"
  version          = var.external_secrets_version
  namespace        = "external-secrets"
  create_namespace = true
  wait             = true

  values = [yamlencode({ serviceAccount = { name = "external-secrets" } })]

  depends_on = [module.external_secrets_identity]
}

resource "helm_release" "envoy_gateway" {
  name             = "eg"
  chart            = "oci://docker.io/envoyproxy/gateway-helm"
  version          = var.envoy_gateway_version
  namespace        = "envoy-gateway-system"
  create_namespace = true
  wait             = true

  depends_on = [helm_release.aws_load_balancer_controller]
}

# Gateway objects, secret stores and the application's database user
resource "helm_release" "platform" {
  name      = "platform"
  chart     = "${path.module}/charts/platform"
  namespace = "envoy-gateway-system"
  wait      = true

  values = [yamlencode({
    certificateArn  = var.certificate_arn
    region          = var.region
    appSecretName   = aws_secretsmanager_secret.app.name
    masterSecretArn = aws_rds_cluster.mysql.master_user_secret[0].secret_arn
    databaseHost    = aws_rds_cluster.mysql.endpoint
    mysqlImage      = "container-registry.oracle.com/mysql/community-server:${var.mysql_engine_version}"
  })]

  depends_on = [helm_release.envoy_gateway, helm_release.external_secrets]
}
