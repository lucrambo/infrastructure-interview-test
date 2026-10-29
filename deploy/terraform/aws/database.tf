# RDS for MySQL 8.4 as a Multi-AZ DB cluster: one writer and two readable standbys, one per zone,
# with automatic failover (ADR-001, plan door 2). Reachable only from the EKS nodes, over TLS.

resource "aws_security_group" "database" {
  name_prefix = "${var.name}-database-"
  description = "MySQL from the EKS nodes only"
  vpc_id      = module.vpc.vpc_id

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "database_from_nodes" {
  security_group_id            = aws_security_group.database.id
  description                  = "MySQL from the EKS nodes"
  referenced_security_group_id = module.eks.node_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 3306
  to_port                      = 3306
}

resource "aws_rds_cluster_parameter_group" "mysql" {
  name_prefix = "${var.name}-mysql84-"
  family      = "mysql8.4"
  description = "posts-api: TLS required"

  parameter {
    name  = "require_secure_transport"
    value = "ON"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_kms_key" "database" {
  description         = "${var.name} database storage, snapshots and secrets"
  enable_key_rotation = true
}

resource "aws_rds_cluster" "mysql" {
  cluster_identifier = var.name
  engine             = "mysql"
  engine_version     = var.mysql_engine_version

  # a Multi-AZ DB cluster: these three settings make RDS create one instance per zone
  db_cluster_instance_class = var.db_instance_class
  storage_type              = "io2"
  allocated_storage         = 100
  iops                      = 3000

  db_subnet_group_name            = module.vpc.database_subnet_group_name
  vpc_security_group_ids          = [aws_security_group.database.id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.mysql.name

  database_name                 = "posts"
  master_username               = "admin"
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.database.arn

  storage_encrypted = true
  kms_key_id        = aws_kms_key.database.arn

  backup_retention_period   = 14
  preferred_backup_window   = "03:00-04:00"
  copy_tags_to_snapshot     = true
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name}-final"

  enabled_cloudwatch_logs_exports       = ["error", "slowquery"]
  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.database.arn
  performance_insights_retention_period = 7

  # engine changes happen in the maintenance window, not on apply
  apply_immediately = false
}

# the application's own credentials, synced into the cluster by External Secrets
resource "random_password" "app" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "app" {
  name_prefix = "${var.name}/database/app-"
  description = "posts-api application database user"
  kms_key_id  = aws_kms_key.database.arn
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    username = "posts"
    password = random_password.app.result
    host     = aws_rds_cluster.mysql.endpoint
    database = "posts"
  })
}
