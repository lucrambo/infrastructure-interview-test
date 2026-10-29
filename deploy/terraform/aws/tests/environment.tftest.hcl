# Applies the configuration against mocked providers: no AWS account, no cost (AD-004), but every
# expression, module input and the resulting topology are evaluated and asserted.

mock_provider "aws" {
  # the providers below decode it; a mock's random string would not be valid base64
  override_resource {
    target = module.eks.aws_eks_cluster.this[0]
    values = {
      certificate_authority = [{ data = "Y2E=" }]
      endpoint              = "https://example.eks.amazonaws.com"
      identity              = [{ oidc = [{ issuer = "https://oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE" }] }]
    }
  }

  # RDS returns the ARN of the master password it manages
  override_resource {
    target = aws_rds_cluster.mysql
    values = {
      master_user_secret = [{
        secret_arn    = "arn:aws:secretsmanager:us-east-1:111122223333:secret:rds-master-AbCdEf"
        kms_key_id    = "arn:aws:kms:us-east-1:111122223333:key/example"
        secret_status = "active"
      }]
      endpoint = "posts-api.cluster-example.us-east-1.rds.amazonaws.com"
    }
  }

  # the provider validates ARN syntax even against mocks
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111122223333:role/mock" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::111122223333:policy/mock" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111122223333:key/mock" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:111122223333:log-group:mock" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-east-1:111122223333:secret:mock-AbCdEf" }
  }

  mock_resource "aws_launch_template" {
    defaults = { id = "lt-0123456789abcdef0" }
  }

  mock_data "aws_eks_addon_version" {
    defaults = { version = "v1.0.0-eksbuild.1" }
  }

  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }

  mock_data "aws_partition" {
    defaults = { partition = "aws", dns_suffix = "amazonaws.com" }
  }

  mock_data "aws_iam_session_context" {
    defaults = { issuer_arn = "arn:aws:iam::111122223333:role/ci" }
  }

  mock_data "aws_caller_identity" {
    defaults = { account_id = "111122223333", arn = "arn:aws:iam::111122223333:user/ci" }
  }
}

mock_provider "helm" {}
mock_provider "tls" {}
mock_provider "time" {}
mock_provider "kubernetes" {}

variables {
  api_allowed_cidrs = ["203.0.113.0/24"]
  certificate_arn   = "arn:aws:acm:us-east-1:111122223333:certificate/example"
}

run "environment" {
  command = apply

  assert {
    condition = (
      length(module.vpc.private_subnets) == 3 &&
      length(module.vpc.public_subnets) == 3 &&
      length(module.vpc.database_subnets) == 3
    )
    error_message = "Every subnet tier must have one subnet per availability zone."
  }

  assert {
    condition     = length(module.vpc.natgw_ids) == 3
    error_message = "One NAT gateway per zone, so a zone outage keeps the others' egress."
  }

  assert {
    condition = (
      aws_rds_cluster.mysql.engine == "mysql" &&
      startswith(aws_rds_cluster.mysql.engine_version, "8.4") &&
      aws_rds_cluster.mysql.db_cluster_instance_class == "db.m6gd.large" &&
      aws_rds_cluster.mysql.storage_type == "io2"
    )
    error_message = "The database must be an RDS for MySQL 8.4 Multi-AZ DB cluster (door 2)."
  }

  assert {
    condition = (
      aws_rds_cluster.mysql.storage_encrypted &&
      aws_rds_cluster.mysql.deletion_protection &&
      aws_rds_cluster.mysql.backup_retention_period == 14 &&
      aws_rds_cluster.mysql.manage_master_user_password &&
      !aws_rds_cluster.mysql.skip_final_snapshot
    )
    error_message = "The database must be encrypted, protected from deletion, backed up for 14 days and keep its master password in Secrets Manager."
  }

  assert {
    condition = anytrue([
      for p in aws_rds_cluster_parameter_group.mysql.parameter : p.name == "require_secure_transport" && p.value == "ON"
    ])
    error_message = "The database must refuse connections without TLS."
  }

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.database_from_nodes.from_port == 3306 &&
      aws_vpc_security_group_ingress_rule.database_from_nodes.to_port == 3306 &&
      aws_vpc_security_group_ingress_rule.database_from_nodes.referenced_security_group_id == module.eks.node_security_group_id &&
      aws_vpc_security_group_ingress_rule.database_from_nodes.cidr_ipv4 == null
    )
    error_message = "MySQL must be reachable only from the EKS node security group."
  }

  assert {
    condition = (
      helm_release.aws_load_balancer_controller.version == "3.6.2" &&
      helm_release.envoy_gateway.version == "v1.9.3" &&
      helm_release.metrics_server.version == "3.14.0" &&
      helm_release.external_secrets.version == "2.14.0"
    )
    error_message = "Every platform chart must be pinned to a version."
  }

  assert {
    condition     = strcontains(helm_release.platform.values[0], "arn:aws:acm:us-east-1:111122223333:certificate/example")
    error_message = "The gateway's load balancer must terminate TLS with the given ACM certificate."
  }
}

run "rejects_an_open_api_endpoint" {
  command = plan

  variables {
    api_allowed_cidrs = ["0.0.0.0/0"]
  }

  expect_failures = [var.api_allowed_cidrs]
}
