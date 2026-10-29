# posts-api Helm chart

Deploys the posts API highly available across availability zones, exposed through the Gateway API
([ADR-003](../../../docs/adr/003-expose-through-the-gateway-api.md)).

```bash
helm upgrade --install posts deploy/helm/posts-api --namespace posts --create-namespace \
  --set database.host=<mysql host> --set database.existingSecret=<secret with key "password">
```

## What it deploys

| Object                                  | Why                                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Deployment`                            | at least 3 replicas, spread one per zone (`DoNotSchedule`) and over nodes; rolling updates never drop a ready replica (`maxUnavailable: 0`)                        |
| `HorizontalPodAutoscaler`               | 3-10 replicas at 70% CPU; needs metrics-server                                                                                                                     |
| `PodDisruptionBudget`                   | node drains evict one replica at a time                                                                                                                            |
| `Job` (hook)                            | runs the migrations before each install and upgrade; a failure fails the release                                                                                   |
| `Service` + `HTTPRoute`                 | only `/posts` is routed; `/healthz`, `/readyz` and `/metrics` stay internal                                                                                        |
| `BackendTrafficPolicy`                  | optional Envoy Gateway rate limit on the route (`rateLimit.enabled`)                                                                                               |
| `NetworkPolicy`                         | ingress only from the gateway and monitoring namespaces; egress only to DNS and the database                                                                       |
| `ConfigMap`, `Secret`, `ServiceAccount` | configuration; the service account has no API token. The migrations Job gets hook copies (`<name>-migrations`) created just before it and deleted once it succeeds |

Pods run as uid 65532 with a read-only root filesystem, no capabilities and the `RuntimeDefault`
seccomp profile. On termination the kubelet waits `preStopSleepSeconds` (5) so the endpoint
removal reaches the proxies, then the server drains for up to `config.shutdownTimeoutMs` (25 s),
inside `terminationGracePeriodSeconds` (35).

## Values

| Key                                                      | Default                               | Meaning                                                                             |
| -------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| `image.repository`                                       | `docker.io/lrambo/posts-api`          | image repository                                                                    |
| `image.tag`                                              | chart `appVersion`                    | image tag                                                                           |
| `image.digest`                                           | `""`                                  | `sha256:...`; when set the image is pulled by digest                                |
| `imagePullSecrets`                                       | `[]`                                  | existing registry secrets                                                           |
| `imageCredentials.registry`, `.username`, `.password`    | `""`                                  | when `registry` is set, the chart creates a `dockerconfigjson` Secret and uses it   |
| `autoscaling.enabled`                                    | `true`                                | HPA instead of a fixed `replicaCount` (3)                                           |
| `autoscaling.minReplicas` / `maxReplicas`                | `3` / `10`                            | the schema refuses fewer than 3                                                     |
| `database.host`                                          | required                              | MySQL host                                                                          |
| `database.port`, `.name`, `.user`                        | `3306`, `posts`, `posts`              | connection settings                                                                 |
| `database.queryTimeoutMs`                                | `5000`                                | query timeout; a connection that times out is replaced                              |
| `database.ssl`                                           | `false`                               | verified TLS to the database (set `true` for RDS)                                   |
| `database.password` / `database.existingSecret`          | one is required                       | password, or the name of a Secret holding it under `existingSecretKey` (`password`) |
| `httpRoute.parentRefs`                                   | `public` in `gateway`                 | the Gateway to attach to                                                            |
| `httpRoute.hostnames`                                    | `[]`                                  | hostnames the route answers                                                         |
| `rateLimit.enabled`, `.requests`, `.unit`                | `false`, `100`, `Second`              | Envoy Gateway local rate limit                                                      |
| `networkPolicy.gatewayNamespace` / `monitoringNamespace` | `envoy-gateway-system` / `monitoring` | namespaces admitted to port 3000                                                    |

`values.schema.json` validates every value; `helm template` fails naming the offending field.

## Guards

Beyond `values.schema.json`, rendering fails when `autoscaling.maxReplicas` is below
`minReplicas`, or when `preStopSleepSeconds` plus `config.shutdownTimeoutMs` does not fit inside
`terminationGracePeriodSeconds`.

## Uninstalling

Every object except the migrations hook copies is a tracked release resource, so
`helm uninstall` removes it and `helm rollback` restores it. If a migrations Job fails, its hook
copies stay for inspection and are replaced by the next upgrade.
