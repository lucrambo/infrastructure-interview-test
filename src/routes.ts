import type { Request, Response } from "express";
import type { DataSource } from "typeorm";
import { postGetAllAction } from "./controller/PostGetAllAction";
import { postGetByIdAction } from "./controller/PostGetByIdAction";
import { postSaveAction } from "./controller/PostSaveAction";

interface AppRoute {
  path: string;
  method: "get" | "post";
  action: (request: Request, response: Response, dataSource: DataSource) => Promise<void>;
}

/**
 * All application routes.
 */
export const AppRoutes: AppRoute[] = [
  {
    path: "/posts",
    method: "get",
    action: postGetAllAction,
  },
  {
    path: "/posts/:id",
    method: "get",
    action: postGetByIdAction,
  },
  {
    path: "/posts",
    method: "post",
    action: postSaveAction,
  },
];
