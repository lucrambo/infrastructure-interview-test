import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("local script", () => {
  it.each([[[]], [["nope"]]])("usage: %j exits 2 and prints the commands", (args) => {
    const result = spawnSync("bash", ["scripts/local.sh", ...args], { encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage: scripts/local.sh up|deploy|test|down|all");
  });
});
