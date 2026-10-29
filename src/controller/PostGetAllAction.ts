import type { Request, Response } from "express";
import { MoreThan, type DataSource } from "typeorm";
import { Post } from "../entity/Post";
import { listQuerySchema, parse } from "../http/validation";

/**
 * Loads one page of posts, keyset-paginated by id; the next page is announced in a `Link` header.
 */
export async function postGetAllAction(
  request: Request,
  response: Response,
  dataSource: DataSource,
): Promise<void> {
  const { limit, after } = parse(listQuerySchema, request.query);

  // one extra row tells whether a next page exists without a COUNT query
  const rows = await dataSource.getRepository(Post).find({
    where: after === undefined ? {} : { id: MoreThan(after) },
    relations: { categories: true },
    order: { id: "ASC", categories: { id: "ASC" } },
    take: limit + 1,
  });
  const posts = rows.slice(0, limit);

  const last = posts.at(-1);
  if (rows.length > limit && last !== undefined) {
    response.links({ next: `/posts?limit=${limit}&after=${last.id}` });
  }
  response.json(posts);
}
