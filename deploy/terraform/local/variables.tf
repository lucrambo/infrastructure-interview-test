variable "cluster_name" {
  description = "Name of the kind cluster; also prefixes the registry container."
  type        = string
  default     = "posts-api"
}

variable "node_image" {
  description = "kindest/node image, pinned by digest."
  type        = string
  default     = "kindest/node:v1.36.4@sha256:099e049362a1526b2db71494e1947aae99bd16290d7c895f2b7ea312e3cbfaed"
}

variable "zones" {
  description = "One worker node per zone, labelled topology.kubernetes.io/zone."
  type        = list(string)
  default     = ["zone-a", "zone-b", "zone-c"]

  validation {
    condition     = length(var.zones) >= 3
    error_message = "At least 3 zones are needed to tolerate the loss of one."
  }
}

variable "gateway_port" {
  description = "Host port (on 127.0.0.1) where the public Gateway answers."
  type        = number
  default     = 8080
}

variable "registry_port" {
  description = "Host port (on 127.0.0.1) of the private registry."
  type        = number
  default     = 5001
}

variable "docker_host" {
  description = "Docker daemon the registry container runs on; null uses DOCKER_HOST or the default socket."
  type        = string
  default     = null
}

variable "mysql_version" {
  description = "MySQL server and router version of the InnoDB Cluster (same LTS line as production)."
  type        = string
  default     = "8.4.10"
}

variable "envoy_gateway_version" {
  description = "Envoy Gateway Helm chart version."
  type        = string
  default     = "v1.9.3"
}

variable "mysql_operator_version" {
  description = "MySQL Operator and InnoDB Cluster Helm chart version."
  type        = string
  default     = "2.3.1"
}

variable "metrics_server_version" {
  description = "metrics-server Helm chart version."
  type        = string
  default     = "3.14.0"
}
