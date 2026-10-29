# Project state

## Decisions

| ID | Decision | Rationale | Status | Date |
| --- | --- | --- | --- | --- |
| AD-001 | The engine stays MySQL, upgraded to 8.4 LTS with the `mysql2` driver. In-cluster it runs as a 3-member InnoDB Cluster (MySQL Operator for Kubernetes), one member per zone; production targets Amazon RDS for MySQL Multi-AZ DB cluster - [ADR-001](../docs/adr/001-use-mysql-with-innodb-cluster-and-rds-multi-az.md) | user: "quero que você utilize na verdade o mysql, mantendo a tecnologia que já é do projeto" | active | 2026-10-29 |
| AD-002 | Container images are published to a public Docker Hub repository | user: "Iremos utilizar o dockerhub" | active | 2026-10-29 |
| AD-003 | The local cluster is kind: 1 control-plane and 3 workers labelled `topology.kubernetes.io/zone` = `zone-a`, `zone-b`, `zone-c` | user: "sim, pode usar o kind"; kind has multi-node clusters, node labels and a Terraform provider | active | 2026-10-29 |
| AD-004 | Every optional goal of the test is in scope; the remote environment is AWS (follows AD-001), delivered as Terraform code validated with `plan`, never applied | user: "faremos todos os opcionais"; the test forbids cost-incurring services | active | 2026-10-29 |
| AD-005 | Images are `docker.io/lrambo/posts-api:<package.json version>` and `:sha-<commit>`, multi-arch (amd64, arm64), on a distroless Node.js 24 runtime pinned by digest; version tags are never overwritten and there is no `latest` - [ADR-002](../docs/adr/002-use-distroless-runtime-image.md) | user delegated: "pode fazer todas as configurações necessárias e definir o nome do repo"; reproducible rollouts and minimal attack surface | active | 2026-10-29 |
