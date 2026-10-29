# EKS with one managed node group of Graviton instances spread over the 3 private subnets
# (ADR-002: the image is multi-arch). Secrets are envelope-encrypted with a module-created KMS key.

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.29"

  name               = var.name
  kubernetes_version = var.kubernetes_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  endpoint_private_access      = true
  endpoint_public_access       = true
  endpoint_public_access_cidrs = var.api_allowed_cidrs

  enable_cluster_creator_admin_permissions = true
  enabled_log_types                        = ["api", "audit", "authenticator"]

  addons = {
    vpc-cni                = { before_compute = true }
    eks-pod-identity-agent = { before_compute = true }
    kube-proxy             = {}
    coredns                = {}
  }

  eks_managed_node_groups = {
    default = {
      ami_type       = "AL2023_ARM_64_STANDARD"
      instance_types = var.node_instance_types
      subnet_ids     = module.vpc.private_subnets

      # at least one node per zone; room for the HPA's 10 API replicas and the platform
      min_size     = 3
      desired_size = 3
      max_size     = 9

      metadata_options = {
        http_tokens                 = "required"
        http_put_response_hop_limit = 1
      }
    }
  }
}
