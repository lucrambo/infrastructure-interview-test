// Burst scenario: 200 requests within about one second must trip the gateway's local rate
// limit (AC 11 of local-env). 429 is the expected answer here, so it is not counted as a failure.
import http from "k6/http";
import { Counter } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:8080";
const limited = new Counter("rate_limited");
const unexpected = new Counter("unexpected_status");

export const options = {
  scenarios: {
    burst: { executor: "shared-iterations", vus: 50, iterations: 200, maxDuration: "10s" },
  },
  thresholds: {
    rate_limited: ["count>0"],
    unexpected_status: ["count==0"],
  },
};

export default function () {
  const res = http.get(`${BASE}/posts?limit=1`, {
    responseCallback: http.expectedStatuses(200, 429),
  });
  if (res.status === 429) limited.add(1);
  else if (res.status !== 200) unexpected.add(1);
}
