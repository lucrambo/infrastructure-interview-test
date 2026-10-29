// Load scenario: a constant 30 requests per second (80% reads, 20% writes) for 60 seconds
// (AC 10 of local-env). RATE and DURATION override the defaults for the availability scenarios.
import http from "k6/http";
import { check } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:8080";
const RATE = Number(__ENV.RATE || 30);
const DURATION = __ENV.DURATION || "60s";
// the rollout scenario requires zero failures; the load scenario allows under 1%
const MAX_FAILED = __ENV.MAX_FAILED || "0.01";

export const options = {
  scenarios: {
    steady: {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: 20,
      maxVUs: 60,
    },
  },
  thresholds: {
    http_req_failed: [`rate<=${MAX_FAILED}`],
    http_req_duration: ["p(95)<500"],
  },
};

export default function () {
  if (Math.random() < 0.2) {
    const res = http.post(
      `${BASE}/posts`,
      JSON.stringify({ title: `load ${__VU}-${__ITER}`, text: "load scenario" }),
      { headers: { "Content-Type": "application/json" } },
    );
    check(res, { "write returns 201": (r) => r.status === 201 });
  } else {
    const res = http.get(`${BASE}/posts?limit=20`);
    check(res, { "read returns 200": (r) => r.status === 200 });
  }
}
