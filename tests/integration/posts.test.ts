import request from "supertest";
import type { Express } from "express";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { captureLogger, createTestDatabase, migratedDataSource, resetTables } from "../helpers";

let dataSource: DataSource;
let app: Express;

beforeAll(async () => {
  dataSource = await migratedDataSource(await createTestDatabase());
  app = createApp({ dataSource, logger: captureLogger().logger });
});

afterAll(async () => {
  await dataSource.destroy();
});

beforeEach(async () => {
  await resetTables(dataSource);
});

const valid = { title: "Hello", text: "World", categories: [{ name: "news" }] };

async function createPosts(count: number): Promise<void> {
  for (let i = 1; i <= count; i++) {
    await request(app)
      .post("/posts")
      .send({ title: `post ${i}`, text: "body", categories: [{ name: `c${i}` }] })
      .expect(201);
  }
}

function expectProblem(res: request.Response, status: number): void {
  expect(res.status).toBe(status);
  expect(res.headers["content-type"]).toMatch(/^application\/problem\+json/);
  expect(res.body).toMatchObject({ type: "about:blank", status });
  expect(typeof (res.body as { title: unknown }).title).toBe("string");
}

async function postCount(): Promise<number> {
  const rows: { n: string | number }[] = await dataSource.query("SELECT COUNT(*) AS n FROM post");
  return Number(rows[0]?.n);
}

describe("POST /posts creates", () => {
  it("answers 201 with the stored post, its category ids and a Location header", async () => {
    const res = await request(app).post("/posts").send(valid);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 1,
      title: "Hello",
      text: "World",
      categories: [{ id: 1, name: "news" }],
    });
    expect(res.headers.location).toBe("/posts/1");
  });

  it("answers an empty categories list when none is sent", async () => {
    const res = await request(app).post("/posts").send({ title: "a", text: "b" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 1, title: "a", text: "b", categories: [] });
  });
});

describe("POST /posts validation", () => {
  const categories = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `c${i}` }));

  it.each([
    ["title missing", { text: "b" }, "title"],
    ["title of 256 characters", { title: "x".repeat(256), text: "b" }, "title"],
    ["empty text", { title: "a", text: "" }, "text"],
    ["text of 10001 characters", { title: "a", text: "x".repeat(10001) }, "text"],
    ["11 categories", { title: "a", text: "b", categories: categories(11) }, "categories"],
    [
      "category name of 101",
      { title: "a", text: "b", categories: [{ name: "x".repeat(101) }] },
      "categories.0.name",
    ],
    ["title not a string", { title: 1, text: "b" }, "title"],
    ["body is an array", [valid], "body"],
  ])("rejects %s with 400 and stores nothing", async (_case, body, field) => {
    const res = await request(app).post("/posts").send(body);
    expectProblem(res, 400);
    expect(res.body).toMatchObject({ errors: [{ field }] });
    expect((res.body as { errors: unknown[] }).errors).toHaveLength(1);
    expect(await postCount()).toBe(0);
  });

  it("reports one entry per invalid field", async () => {
    const res = await request(app).post("/posts").send({ title: "", text: "" });
    expectProblem(res, 400);
    const fields = (res.body as { errors: { field: string }[] }).errors.map((e) => e.field);
    expect(fields.sort()).toEqual(["text", "title"]);
  });

  it.each([
    ["title of 255 characters", { title: "x".repeat(255), text: "b" }],
    ["text of 10000 characters", { title: "a", text: "x".repeat(10000) }],
    ["10 categories", { title: "a", text: "b", categories: categories(10) }],
  ])("accepts %s", async (_case, body) => {
    const res = await request(app).post("/posts").send(body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject(body);
  });

  it("rejects an id chosen by the client and leaves the existing post unchanged", async () => {
    await createPosts(1);
    const res = await request(app).post("/posts").send({ id: 1, title: "hijack", text: "x" });
    expectProblem(res, 400);
    expect(res.body).toMatchObject({ errors: [{ field: "id" }] });
    const post = await request(app).get("/posts/1");
    expect(post.body).toMatchObject({ id: 1, title: "post 1" });
    expect(await postCount()).toBe(1);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await request(app)
      .post("/posts")
      .set("Content-Type", "application/json")
      .send('{"title": "a",');
    expectProblem(res, 400);
    expect(res.body).toMatchObject({ errors: [{ field: "body" }] });
  });
});

describe("POST /posts limits", () => {
  it("body over 100 kB answers 413", async () => {
    const res = await request(app)
      .post("/posts")
      .send({ title: "a", text: "x".repeat(101 * 1024) });
    expectProblem(res, 413);
    expect(await postCount()).toBe(0);
  });

  it("unsupported media type answers 415", async () => {
    const res = await request(app)
      .post("/posts")
      .set("Content-Type", "text/plain")
      .send("title=a&text=b");
    expectProblem(res, 415);
    expect(await postCount()).toBe(0);
  });
});

describe("GET /posts pagination", () => {
  it("answers an empty array when there are no posts", async () => {
    const res = await request(app).get("/posts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(res.headers.link).toBeUndefined();
  });

  it("returns the first 20 of 25 posts with categories and a next link", async () => {
    await createPosts(25);
    const res = await request(app).get("/posts");
    expect(res.status).toBe(200);
    const posts = res.body as { id: number }[];
    expect(posts.map((p) => p.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(posts[0]).toEqual({
      id: 1,
      title: "post 1",
      text: "body",
      categories: [{ id: 1, name: "c1" }],
    });
    expect(res.headers.link).toBe('</posts?limit=20&after=20>; rel="next"');
  });

  it("returns the rest after a cursor, with no next link on the last page", async () => {
    await createPosts(25);
    const res = await request(app).get("/posts?after=20");
    expect((res.body as { id: number }[]).map((p) => p.id)).toEqual([21, 22, 23, 24, 25]);
    expect(res.headers.link).toBeUndefined();
  });

  it("has no next link when exactly one page exists", async () => {
    await createPosts(20);
    const res = await request(app).get("/posts");
    expect(res.body).toHaveLength(20);
    expect(res.headers.link).toBeUndefined();
  });

  it("honours limit, up to 100", async () => {
    await createPosts(3);
    const one = await request(app).get("/posts?limit=1");
    expect((one.body as { id: number }[]).map((p) => p.id)).toEqual([1]);
    expect(one.headers.link).toBe('</posts?limit=1&after=1>; rel="next"');
    const hundred = await request(app).get("/posts?limit=100");
    expect(hundred.status).toBe(200);
    expect(hundred.body).toHaveLength(3);
  });
});

describe("GET /posts rejects", () => {
  it.each([
    ["limit=0", "limit"],
    ["limit=101", "limit"],
    ["limit=abc", "limit"],
    ["limit=1.5", "limit"],
    ["after=-1", "after"],
    ["after=0", "after"],
    ["after=2147483648", "after"],
    ["limit=1&limit=2", "limit"],
  ])("%s with 400 naming the parameter", async (query, field) => {
    const res = await request(app).get(`/posts?${query}`);
    expectProblem(res, 400);
    expect(res.body).toMatchObject({ errors: [{ field }] });
  });
});

describe("GET /posts/:id returns", () => {
  it("the post with its categories, as it was created", async () => {
    const body = {
      title: "Título ✓",
      text: "línea\nnueva 🚀",
      categories: [{ name: "b" }, { name: "a" }],
    };
    const created = await request(app).post("/posts").send(body).expect(201);
    const res = await request(app).get("/posts/1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(created.body);
    expect(res.body).toEqual({
      id: 1,
      title: body.title,
      text: body.text,
      categories: [
        { id: 1, name: "b" },
        { id: 2, name: "a" },
      ],
    });
  });
});

describe("GET /posts/:id absent", () => {
  it("answers 404", async () => {
    expectProblem(await request(app).get("/posts/99"), 404);
  });
});

describe("GET /posts/:id rejects", () => {
  it.each(["abc", "0", "2147483648", "1.5", "-1", "1e3"])("id %s with 400", async (id) => {
    expectProblem(await request(app).get(`/posts/${id}`), 400);
  });

  it("accepts the largest id and answers 404 when it is absent", async () => {
    expectProblem(await request(app).get("/posts/2147483647"), 404);
  });
});
