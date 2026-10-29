import { describe, expect, it } from "vitest";
import { gateway, kubectl, kubectlJson, nodeZones, pods, run, tfOutput } from "./cluster";

describe("platform", () => {
  it("cluster has one control-plane and zoned workers", () => {
    const nodes = kubectlJson<{
      items: { metadata: { name: string; labels: Record<string, string> } }[];
    }>("get", "nodes").items;
    const controlPlanes = nodes.filter(
      (n) => "node-role.kubernetes.io/control-plane" in n.metadata.labels,
    );
    const workers = nodes.filter(
      (n) => !("node-role.kubernetes.io/control-plane" in n.metadata.labels),
    );
    expect(controlPlanes).toHaveLength(1);
    expect(workers.map((n) => n.metadata.labels["topology.kubernetes.io/zone"]).sort()).toEqual([
      "zone-a",
      "zone-b",
      "zone-c",
    ]);
    expect(nodes.every((n) => n.metadata.name.startsWith("posts-api-"))).toBe(true);
  });

  it("gateway and metrics: the Gateway is programmed and answers, metrics-server serves all nodes", async () => {
    const gw = kubectlJson<{ status: { conditions: { type: string; status: string }[] } }>(
      "get",
      "gateway",
      "public",
      "-n",
      "gateway",
    );
    expect(gw.status.conditions.find((c) => c.type === "Programmed")?.status).toBe("True");
    const res = await fetch(`${gateway()}/`);
    expect(res.status).toBe(404);

    const top = kubectl("top", "nodes", "--no-headers");
    expect(top.status, top.stderr).toBe(0);
    expect(top.stdout.trim().split("\n")).toHaveLength(4);
  });

  it("database: InnoDB Cluster online with one member per zone, routers in two zones, app user works", () => {
    const cluster = kubectlJson<{
      status: { cluster: { status: string; onlineInstances: number } };
    }>("get", "innodbcluster", "mysql", "-n", "database");
    expect(cluster.status.cluster.status).toBe("ONLINE");
    expect(cluster.status.cluster.onlineInstances).toBe(3);

    const zones = nodeZones();
    const members = pods("database", "mysql.oracle.com/cluster=mysql,component=mysqld");
    expect(new Set(members.map((p) => zones.get(p.spec.nodeName))).size).toBe(3);
    const routers = pods("database", "mysql.oracle.com/cluster=mysql,component=mysqlrouter");
    expect(routers).toHaveLength(2);
    expect(new Set(routers.map((p) => zones.get(p.spec.nodeName))).size).toBe(2);

    const secret = kubectlJson<{ data: { password: string } }>(
      "get",
      "secret",
      tfOutput("database_secret"),
      "-n",
      "posts",
    );
    const password = Buffer.from(secret.data.password, "base64").toString();
    const login = kubectl(
      "exec",
      "-n",
      "database",
      members[0]?.metadata.name ?? "",
      "-c",
      "mysql",
      "--",
      "mysql",
      `--host=${tfOutput("database_host")}`,
      "--user=posts",
      `--password=${password}`,
      "--database=posts",
      "--batch",
      "--skip-column-names",
      "-e",
      "SELECT DATABASE()",
    );
    expect(login.status, login.stderr).toBe(0);
    expect(login.stdout.trim()).toBe("posts");
  });

  it("no drift: a plan right after the apply changes nothing", () => {
    const plan = run("terraform", [
      "-chdir=deploy/terraform/local",
      "plan",
      "-detailed-exitcode",
      "-input=false",
      "-no-color",
    ]);
    expect(plan.status, plan.stdout + plan.stderr).toBe(0);
  });
});
