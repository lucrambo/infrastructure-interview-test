import { describe, expect, it } from "vitest";
import { createHttpServer } from "../../src/server";

describe("http server", () => {
  it("timeouts outlast load balancer idle timeouts and bound request reads", () => {
    const server = createHttpServer(() => undefined);
    expect(server.keepAliveTimeout).toBe(65000);
    expect(server.headersTimeout).toBe(66000);
    expect(server.requestTimeout).toBe(30000);
  });
});
