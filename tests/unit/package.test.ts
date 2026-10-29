import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MYSQL_IMAGE } from "../mysql";

interface PackageJson {
  name: string;
  private?: boolean;
  engines?: { node?: string };
  scripts: Record<string, string>;
  repository?: unknown;
  bugs?: unknown;
  author?: unknown;
}

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;

describe("package", () => {
  it("start script runs the compiled server without the TypeScript compiler", () => {
    expect(pkg.scripts.start).toMatch(/^node\s.*\bdist\/server\.js$/);
    expect(pkg.scripts.start).not.toMatch(/\btsc\b|ts-node|tsx/);
    expect(pkg.scripts.build).toContain("tsc -p tsconfig.build.json");
  });

  it("metadata belongs to this project", () => {
    expect(pkg.name).toBe("posts-api");
    expect(pkg.private).toBe(true);
    expect(pkg.engines?.node).toBe(">=24 <25");
    expect(pkg).not.toHaveProperty("repository");
    expect(pkg).not.toHaveProperty("bugs");
    expect(pkg).not.toHaveProperty("author");
  });

  it("typescript runs in strict mode", () => {
    const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8")) as {
      compilerOptions: { strict?: boolean };
    };
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it("integration tests run against the mysql image of production's major line", () => {
    expect(MYSQL_IMAGE).toBe("mysql:8.4");
  });
});
