import { execFileSync } from "node:child_process";

/** Builds the image under test with the same command a maintainer runs. */
export default function setup(): void {
  execFileSync("bash", ["scripts/image.sh", "build"], { stdio: "inherit" });
}
