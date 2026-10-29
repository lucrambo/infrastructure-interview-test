// Functional scenario through the gateway: one pass over the API contract (AC 9 of local-env).
// Exits non-zero unless every check passes.
import http from "k6/http";
import { check, group } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:8080";
const JSON_HEADERS = { headers: { "Content-Type": "application/json" } };

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: { checks: ["rate==1.0"] },
};

function isProblem(res, status) {
  return (
    res.status === status &&
    String(res.headers["Content-Type"]).startsWith("application/problem+json") &&
    res.json("status") === status
  );
}

export default function () {
  let id;
  group("create and read back", () => {
    const body = { title: `k6 ${Date.now()}`, text: "functional", categories: [{ name: "e2e" }] };
    const created = http.post(`${BASE}/posts`, JSON.stringify(body), JSON_HEADERS);
    id = created.json("id");
    check(created, {
      "create returns 201": (r) => r.status === 201,
      "create returns Location": (r) => r.headers.Location === `/posts/${id}`,
    });
    const read = http.get(`${BASE}/posts/${id}`);
    check(read, {
      "read returns 200": (r) => r.status === 200,
      "read returns the created post": (r) =>
        r.json("title") === body.title &&
        r.json("text") === body.text &&
        r.json("categories.0.name") === "e2e",
    });
  });

  group("pagination", () => {
    // at least two posts exist, so a page of one has a next link
    http.post(`${BASE}/posts`, JSON.stringify({ title: "second", text: "page" }), JSON_HEADERS);
    const page = http.get(`${BASE}/posts?limit=1`);
    check(page, {
      "list returns 200": (r) => r.status === 200,
      "list returns one post": (r) => r.json().length === 1,
      "list links the next page": (r) => /rel="next"/.test(String(r.headers.Link)),
    });
  });

  group("errors", () => {
    check(http.post(`${BASE}/posts`, JSON.stringify({ text: "no title" }), JSON_HEADERS), {
      "invalid body returns 400 problem": (r) =>
        isProblem(r, 400) && r.json("errors.0.field") === "title",
    });
    check(
      http.post(
        `${BASE}/posts`,
        JSON.stringify({ title: "a", text: "x".repeat(110 * 1024) }),
        JSON_HEADERS,
      ),
      {
        "oversized body returns 413 problem": (r) => isProblem(r, 413),
      },
    );
    check(http.post(`${BASE}/posts`, "title=a", { headers: { "Content-Type": "text/plain" } }), {
      "non-JSON body returns 415 problem": (r) => isProblem(r, 415),
    });
    check(http.get(`${BASE}/posts/2147483647`), {
      "absent post returns 404 problem": (r) => isProblem(r, 404),
    });
  });

  group("internal endpoints are not routed", () => {
    for (const path of ["/healthz", "/readyz", "/metrics"]) {
      check(http.get(`${BASE}${path}`), {
        [`${path} returns 404 from the gateway`]: (r) => r.status === 404,
      });
    }
  });
}
