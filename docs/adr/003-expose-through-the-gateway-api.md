# ADR-003: Expose the service through the Gateway API, with Envoy Gateway as the implementation

- **Date**: 2026-10-29
- **Status**: Accepted
- **Deciders**: project owner, implementation team
- **Tags**: availability, security, networking

## Context and Problem Statement

The API must be reachable from outside the cluster through a reverse proxy, while its probe and
metrics endpoints stay internal, and abusive request rates must be cut before they reach the pods
(per-pod counters are wrong behind N replicas). The long-standing default, ingress-nginx, was
retired by Kubernetes SIG Network in March 2026 and no longer receives security fixes.

## Decision Drivers

- A maintained, vendor-neutral routing API that every major cloud and controller implements
- Path-level routing, so only `/posts` is public
- Rate limiting at the edge, shared by all replicas
- Runs on kind locally and maps to a managed load balancer in production

## Considered Options

- Gateway API `HTTPRoute`, Envoy Gateway as the local implementation
- `Ingress` with ingress-nginx
- `Service` of type `LoadBalancer`

## Decision Outcome

Chosen option: **Gateway API with Envoy Gateway**, because the Gateway API is the Kubernetes
successor to `Ingress`, splits ownership cleanly (the platform owns the `Gateway`, the chart owns
its `HTTPRoute`) and Envoy Gateway is a CNCF implementation with built-in rate limiting.

### Positive Consequences

- The chart depends only on the standard `HTTPRoute`; production can attach it to any conformant
  Gateway (for example the AWS Gateway API controller) without changing the chart
- Probe and metrics paths are simply not routed, so they cannot be reached from outside
- Rate limits live in a `BackendTrafficPolicy` next to the route

### Negative Consequences

- Gateway API CRDs and a controller must be installed in every cluster
- The rate limit policy is specific to Envoy Gateway and is optional in the chart

## Pros and Cons of the Options

### Gateway API + Envoy Gateway ✅ Chosen

- ✅ Standard, role-oriented API; maintained implementation; edge rate limiting
- ❌ Extra CRDs and controller to operate

### Ingress + ingress-nginx

- ✅ Familiar
- ❌ Retired upstream in March 2026: no security fixes

### Service type LoadBalancer

- ✅ No extra component
- ❌ Exposes every port and path, including probes and metrics; no routing or rate limiting;
  one cloud load balancer per service raises cost

## Links

- [AD-006 in .specs/STATE.md](../../.specs/STATE.md)
- https://gateway-api.sigs.k8s.io/
- https://gateway.envoyproxy.io/
