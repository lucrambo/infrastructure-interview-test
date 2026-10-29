import type { Request, Response } from "express";
import type { DataSource } from "typeorm";
import { Post } from "../entity/Post";
import { HttpError } from "../http/errors";
import { idParamSchema, parse } from "../http/validation";

/**
 * Loads post by a given id.
 */
export async function postGetByIdAction(
  request: Request,
  response: Response,
  dataSource: DataSource,
): Promise<void> {
  const { id } = parse(idParamSchema, request.params);

  const post = await dataSource.getRepository(Post).findOne({
    where: { id },
    relations: { categories: true },
    order: { categories: { id: "ASC" } },
  });

  if (!post) {
    throw new HttpError(404, `Post ${id} does not exist`);
  }

  response.json(post);
}
