# MySQL 8.4 as a 3-member InnoDB Cluster, one member per zone, behind 2 MySQL Routers
# (ADR-001, plan door 2). The application connects to the Router service.

locals {
  db_namespace  = "database"
  app_namespace = "posts"
  zone_spread = {
    maxSkew           = 1
    topologyKey       = "topology.kubernetes.io/zone"
    whenUnsatisfiable = "DoNotSchedule"
  }
}

resource "random_password" "mysql_root" {
  length  = 32
  special = false
}

resource "random_password" "posts" {
  length  = 32
  special = false
}

resource "helm_release" "mysql_operator" {
  name             = "mysql-operator"
  repository       = "https://mysql.github.io/mysql-operator/"
  chart            = "mysql-operator"
  version          = var.mysql_operator_version
  namespace        = "mysql-operator"
  create_namespace = true
  wait             = true
  timeout          = 600

  depends_on = [kind_cluster.this]
}

resource "helm_release" "mysql" {
  name             = "mysql"
  repository       = "https://mysql.github.io/mysql-operator/"
  chart            = "mysql-innodbcluster"
  version          = var.mysql_operator_version
  namespace        = local.db_namespace
  create_namespace = true
  # the operator brings the cluster online after the release; database-init waits for it
  wait = false

  values = [yamlencode({
    serverVersion   = var.mysql_version
    serverInstances = 3
    tls             = { useSelfSigned = true }
    credentials = {
      root = { user = "root", password = random_password.mysql_root.result, host = "%" }
    }
    serverConfig = {
      mycnf = <<-CNF
        [mysqld]
        innodb_buffer_pool_size=128M
        max_connections=200
      CNF
    }
    podSpec = {
      topologySpreadConstraints = [merge(local.zone_spread, {
        labelSelector = { matchLabels = { "mysql.oracle.com/cluster" = "mysql", "component" = "mysqld" } }
      })]
    }
    # the chart's own key; setting router.instances as well conflicts with its default of 1
    routerInstances = 2
    router = {
      podSpec = {
        topologySpreadConstraints = [merge(local.zone_spread, {
          labelSelector = { matchLabels = { "mysql.oracle.com/cluster" = "mysql", "component" = "mysqlrouter" } }
        })]
      }
    }
    datadirVolumeClaimTemplate = {
      # the chart wraps this string in a list itself
      accessModes = "ReadWriteOnce"
      resources   = { requests = { storage = "2Gi" } }
    }
  })]

  depends_on = [helm_release.mysql_operator]
}

resource "kubernetes_namespace_v1" "posts" {
  metadata {
    name = local.app_namespace
  }

  depends_on = [kind_cluster.this]
}

# the application reads its password from here (chart value database.existingSecret)
resource "kubernetes_secret_v1" "posts_db" {
  metadata {
    name      = "posts-db"
    namespace = kubernetes_namespace_v1.posts.metadata[0].name
  }
  data = { password = random_password.posts.result }
}

# creates the `posts` database and user once the cluster accepts writes
resource "helm_release" "database_init" {
  name          = "database-init"
  chart         = "${path.module}/charts/database-init"
  namespace     = local.db_namespace
  wait          = true
  wait_for_jobs = true
  timeout       = 1200

  values = [yamlencode({
    image        = "container-registry.oracle.com/mysql/community-server:${var.mysql_version}"
    host         = "mysql.${local.db_namespace}.svc.cluster.local"
    rootPassword = random_password.mysql_root.result
    database     = "posts"
    user         = "posts"
    password     = random_password.posts.result
  })]

  depends_on = [helm_release.mysql]
}
