import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 180_000,
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
          globalSetup: ["tests/global-setup.ts"],
        },
      },
      {
        // against the running local environment (scripts/local.sh up and deploy); one file at a time
        extends: true,
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.ts"],
          fileParallelism: false,
          testTimeout: 900_000,
        },
      },
      {
        // workflow files and release tooling; actionlint runs in Docker; `yarn test:ci`
        extends: true,
        test: { name: "ci", include: ["tests/ci/**/*.test.ts"] },
      },
      {
        // renders the Helm chart; needs `helm` and Docker (kubeconform); `yarn test:chart`
        extends: true,
        test: { name: "chart", include: ["tests/chart/**/*.test.ts"] },
      },
      {
        // builds posts-api:local first; selected with `yarn test:image`
        extends: true,
        test: {
          name: "image",
          include: ["tests/image/**/*.test.ts"],
          globalSetup: ["tests/global-setup.ts", "tests/image/global-setup.ts"],
          testTimeout: 600_000,
        },
      },
    ],
  },
});
