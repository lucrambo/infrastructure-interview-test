# One public, private and database subnet per zone, and one NAT gateway per zone so a zone
# outage never cuts the others' egress.

locals {
  private_subnets  = [for i, _ in var.azs : cidrsubnet(var.vpc_cidr, 4, i)]      # /20 each
  public_subnets   = [for i, _ in var.azs : cidrsubnet(var.vpc_cidr, 8, 48 + i)] # /24 each
  database_subnets = [for i, _ in var.azs : cidrsubnet(var.vpc_cidr, 8, 64 + i)] # /24 each
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.7"

  name = var.name
  cidr = var.vpc_cidr
  azs  = var.azs

  private_subnets  = local.private_subnets
  public_subnets   = local.public_subnets
  database_subnets = local.database_subnets

  create_database_subnet_group       = true
  create_database_subnet_route_table = true

  enable_nat_gateway     = true
  single_nat_gateway     = false
  one_nat_gateway_per_az = true

  enable_dns_hostnames = true
  enable_dns_support   = true

  enable_flow_log                                 = true
  create_flow_log_cloudwatch_log_group            = true
  create_flow_log_cloudwatch_iam_role             = true
  flow_log_max_aggregation_interval               = 60
  flow_log_cloudwatch_log_group_retention_in_days = 90

  # where the AWS Load Balancer Controller places load balancers
  public_subnet_tags  = { "kubernetes.io/role/elb" = "1" }
  private_subnet_tags = { "kubernetes.io/role/internal-elb" = "1" }
}
