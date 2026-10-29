import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Settings the mocked `terraform test` cannot reach, because they sit inside community modules.
const eks = readFileSync("deploy/terraform/aws/eks.tf", "utf8");
const platform = readFileSync(
  "deploy/terraform/aws/charts/platform/templates/gateway.yaml",
  "utf8",
);

describe("aws configuration", () => {
  it("node group runs Graviton across the private subnets with 3 to 9 nodes", () => {
    expect(eks).toMatch(/ami_type\s*=\s*"AL2023_ARM_64_STANDARD"/);
    expect(eks).toMatch(/subnet_ids\s*=\s*module\.vpc\.private_subnets/);
    expect(eks).toMatch(/min_size\s*=\s*3/);
    expect(eks).toMatch(/desired_size\s*=\s*3/);
    expect(eks).toMatch(/max_size\s*=\s*9/);
    expect(eks).toMatch(/http_tokens\s*=\s*"required"/);
    // the module encrypts secrets with its own KMS key unless told otherwise
    expect(eks).not.toMatch(/create_kms_key\s*=\s*false/);
    expect(eks).not.toMatch(/encryption_config\s*=\s*null/);
    const defaultTypes = readFileSync("deploy/terraform/aws/variables.tf", "utf8");
    expect(defaultTypes).toMatch(/default\s*=\s*\["m7g\.large"\]/);
  });

  it("load balancer is an internet-facing NLB terminating TLS with the ACM certificate", () => {
    expect(platform).toContain("service.beta.kubernetes.io/aws-load-balancer-type: external");
    expect(platform).toContain(
      "service.beta.kubernetes.io/aws-load-balancer-scheme: internet-facing",
    );
    expect(platform).toContain(
      "service.beta.kubernetes.io/aws-load-balancer-ssl-cert: {{ .Values.certificateArn | quote }}",
    );
    expect(platform).toContain('service.beta.kubernetes.io/aws-load-balancer-ssl-ports: "443"');
    expect(platform).toMatch(/replicas: 3/);
  });
});
