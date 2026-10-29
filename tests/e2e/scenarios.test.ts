import { describe, expect, it } from "vitest";
import { k6 } from "./cluster";

describe("scenarios", () => {
  it("functional scenario passes every check through the gateway", () => {
    const result = k6("functional.js");
    expect(result.status, result.output).toBe(0);
    const checks = result.summary.metrics.checks?.values;
    expect(checks?.fails).toBe(0);
    // one per check in tests/k6/functional.js
    expect(checks?.passes).toBe(14);
  });

  it("load scenario at 30 req/s for 60 s keeps failures under 1% and p95 under 500 ms", () => {
    const result = k6("load.js");
    expect(result.status, result.output).toBe(0);
    const failed = result.summary.metrics.http_req_failed?.values;
    const duration = result.summary.metrics.http_req_duration?.values;
    const requests = result.summary.metrics.http_reqs?.values;
    expect(requests?.count).toBeGreaterThanOrEqual(1700);
    expect(failed?.value).toBeLessThan(0.01);
    expect(duration?.["p(95)"]).toBeLessThan(500);
  });

  it("rate limit answers 429 to a burst of 200 requests", () => {
    const result = k6("burst.js");
    expect(result.status, result.output).toBe(0);
    expect(result.summary.metrics.rate_limited?.values.count).toBeGreaterThan(0);
    expect(result.summary.metrics.unexpected_status?.values.count ?? 0).toBe(0);
  });
});
