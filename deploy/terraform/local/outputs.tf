output "kubeconfig_path" {
  description = "Kubeconfig of the cluster; scripts/local.sh exports it as KUBECONFIG."
  value       = kind_cluster.this.kubeconfig_path
}

output "gateway_url" {
  description = "Where the public Gateway answers on this machine."
  value       = "http://localhost:${var.gateway_port}"
}

output "registry_push" {
  description = "Registry address for pushes from this machine."
  value       = "localhost:${var.registry_port}"
}

output "registry_pull" {
  description = "Registry address as nodes and pods see it."
  value       = "${local.registry_name}:5000"
}

output "registry_username" {
  value = local.registry_user
}

output "registry_password" {
  value     = random_password.registry.result
  sensitive = true
}

output "database_host" {
  value = "mysql.${local.db_namespace}.svc.cluster.local"
}

output "database_secret" {
  description = "Secret in the app namespace holding the database password under `password`."
  value       = kubernetes_secret_v1.posts_db.metadata[0].name
}

output "app_namespace" {
  value = kubernetes_namespace_v1.posts.metadata[0].name
}
