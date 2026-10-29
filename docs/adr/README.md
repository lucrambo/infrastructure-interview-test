# Architecture decision records

The decisions that are hard to reverse, decide availability, security or data durability, or
invite "why not the alternative?". Every decision, including the smaller ones, is in
[.specs/STATE.md](../../.specs/STATE.md).

| ADR | Decision |
| --- | --- |
| [001](001-use-mysql-with-innodb-cluster-and-rds-multi-az.md) | Keep MySQL, upgraded to 8.4 LTS, on InnoDB Cluster in-cluster and RDS Multi-AZ in production |
| [002](002-use-distroless-runtime-image.md) | A distroless Node.js runtime image with immutable, multi-arch tags |
| [003](003-expose-through-the-gateway-api.md) | Expose the service through the Gateway API, with Envoy Gateway |
