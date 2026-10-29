# ADR-001: Keep MySQL, upgraded to 8.4 LTS, on InnoDB Cluster in-cluster and RDS Multi-AZ in production

- **Date**: 2026-10-29
- **Status**: Accepted
- **Deciders**: project owner, implementation team
- **Tags**: database, availability, data durability

## Context and Problem Statement

The application is written for MySQL (TypeORM with the `mysql` driver; the README starts a
MariaDB 5.5 container, out of support since 2020). The service must run 24/7 with worker nodes in
3 availability zones, so a single database instance would be the single point of failure.
No data exists yet, so the version and topology can change at no migration cost.

## Decision Drivers

- The database must survive the loss of one availability zone without manual intervention
- Keep the technology the project already uses: the smallest change to the delivered application
- The same engine and major version locally and in production, so migrations are tested once
- A local environment that costs nothing (kind), and a managed service in production

## Considered Options

- MySQL 8.4 LTS: MySQL Operator for Kubernetes (InnoDB Cluster) in-cluster, Amazon RDS for MySQL
  Multi-AZ DB cluster in production
- PostgreSQL, in-cluster through an operator and on Amazon RDS in production
- MariaDB: MariaDB Operator (primary-replica with automatic failover, or Galera), Amazon RDS for
  MariaDB in production
- A single database Pod with a PersistentVolume

## Decision Outcome

Chosen option: **MySQL 8.4 LTS on InnoDB Cluster and RDS for MySQL Multi-AZ DB cluster**, because
it keeps the project's engine and still gives automated, zone-aware failover in both environments.
8.4 is the current long-term-support line (8.0 reached end of life in April 2026).

### Positive Consequences

- Zone failure is covered: a 3-member InnoDB Cluster (Group Replication, single primary) spread
  across zones with MySQL Router in front locally; a Multi-AZ DB cluster (one writer, two readable
  standbys in 3 AZs) on RDS
- The application keeps its entities and SQL dialect; only the driver moves from the unmaintained
  `mysql` (last release 2020, no `caching_sha2_password`, the 8.x default) to `mysql2`, the driver
  TypeORM 1.x supports
- Production operations (patching, backups, point-in-time recovery) are delegated to AWS

### Negative Consequences

- MySQL DDL is not transactional: a migration that fails halfway leaves the statements before the
  failure applied. Migrations stay small, one concern each, with a tested `down`
- Two operational models: an operator locally, a managed service in production; the Helm chart
  must accept an external database endpoint and credentials instead of creating one
- The MySQL Operator adds cluster-wide CRDs and a Router tier to the local environment

## Pros and Cons of the Options

### MySQL 8.4 + InnoDB Cluster / RDS Multi-AZ DB cluster ✅ Chosen

- ✅ Same engine the project was built on; least change to the application
- ✅ Automated failover in both environments, same engine and version everywhere
- ❌ Non-transactional DDL
- ❌ The in-cluster operator has no built-in point-in-time recovery

### PostgreSQL

- ✅ Transactional DDL: a failed migration rolls back entirely
- ❌ Changes the engine, the driver and the SQL dialect of the delivered application for an
  availability property MySQL already offers

### MariaDB + MariaDB Operator / RDS for MariaDB

- ✅ Closest to the README's container
- ✅ The operator supports primary-replica replication with automatic failover, not only Galera
- ❌ RDS for MariaDB has no Multi-AZ DB cluster with readable standbys, so production failover is
  slower and the standby serves no reads

### Single database Pod with a PersistentVolume

- ✅ Simplest to build
- ❌ A zone or node loss takes the whole service down; volumes are zonal and cannot follow the Pod

## Links

- [AD-001 in .specs/STATE.md](../../.specs/STATE.md)
- https://dev.mysql.com/doc/mysql-operator/en/
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts.html
