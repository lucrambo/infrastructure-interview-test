import type { Request, Response } from "express";
import type { DataSource } from "typeorm";
import { Post } from "../entity/Post";
import { HttpError } from "../http/errors";
import { parse, postBodySchema } from "../http/validation";

/**
 * Saves given post.
 */
export async function postSaveAction(
  request: Request,
  response: Response,
  dataSource: DataSource,
): Promise<void> {
  if (!request.is("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  const body = parse(postBodySchema, request.body);

  // build the entity from validated fields only, so a client can never choose an id
  const postRepository = dataSource.getRepository(Post);
  const newPost = postRepository.create({
    title: body.title,
    text: body.text,
    categories: (body.categories ?? []).map((category) => ({ name: category.name })),
  });

  // the post, its categories and the join rows are written in one transaction
  await postRepository.save(newPost);

  response.status(201).location(`/posts/${newPost.id}`).json(newPost);
}
