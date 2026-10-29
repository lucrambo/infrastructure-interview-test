output "cluster_name" {
  value = module.eks.cluster_name
}

output "database_host" {
  description = "RDS writer endpoint, for the chart's database.host."
  value       = aws_rds_cluster.mysql.endpoint
}

output "database_reader_host" {
  description = "Reader endpoint over the two standbys, for read-only clients."
  value       = aws_rds_cluster.mysql.reader_endpoint
}

output "app_secret_name" {
  description = "Secrets Manager secret External Secrets syncs into the Kubernetes Secret posts-db."
  value       = aws_secretsmanager_secret.app.name
}

output "kubeconfig_command" {
  value = "aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.region}"
}
