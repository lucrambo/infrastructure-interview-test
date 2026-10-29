variable "name" {
  description = "Name of the environment's resources (VPC, cluster, database)."
  type        = string
  default     = "posts-api"
}

variable "environment" {
  description = "Environment name, used in tags."
  type        = string
  default     = "production"
}

variable "region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "azs" {
  description = "Availability zones; the service tolerates the loss of any one."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]

  validation {
    condition     = length(var.azs) == 3
    error_message = "Exactly 3 availability zones: the RDS Multi-AZ DB cluster places one instance in each."
  }
}

variable "vpc_cidr" {
  description = "CIDR of the VPC; subnets are carved from it per zone."
  type        = string
  default     = "10.40.0.0/16"
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version."
  type        = string
  default     = "1.35"
}

variable "api_allowed_cidrs" {
  description = "CIDRs allowed to reach the public EKS API endpoint (CI runners, operators)."
  type        = list(string)

  validation {
    condition     = length(var.api_allowed_cidrs) > 0 && !contains(var.api_allowed_cidrs, "0.0.0.0/0")
    error_message = "Name the networks allowed to reach the EKS API; 0.0.0.0/0 is not accepted."
  }
}

variable "node_instance_types" {
  description = "Graviton (arm64) instance types of the managed node group."
  type        = list(string)
  default     = ["m7g.large"]
}

variable "mysql_engine_version" {
  description = "RDS for MySQL engine version (8.4 LTS line, as locally)."
  type        = string
  default     = "8.4.10"
}

variable "db_instance_class" {
  description = "Instance class of the Multi-AZ DB cluster; it must be a class with local NVMe (gd)."
  type        = string
  default     = "db.m6gd.large"
}

variable "certificate_arn" {
  description = "ACM certificate the Network Load Balancer terminates TLS with."
  type        = string
}

variable "envoy_gateway_version" {
  type    = string
  default = "v1.9.3"
}

variable "aws_load_balancer_controller_version" {
  type    = string
  default = "3.6.2"
}

variable "external_secrets_version" {
  type    = string
  default = "2.14.0"
}

variable "metrics_server_version" {
  type    = string
  default = "3.14.0"
}
