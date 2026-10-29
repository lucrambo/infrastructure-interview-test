import { STATUS_CODES } from "node:http";
import type { ErrorRequestHandler, RequestHandler, Response } from "express";
import type { Logger } from "../logger";

export interface FieldError {
  field: string;
  message: string;
}

/** An error whose status and detail are safe to show to the client. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail?: string,
    readonly errors?: FieldError[],
  ) {
    super(detail ?? STATUS_CODES[status]);
    this.name = "HttpError";
  }
}

/** Writes an RFC 9457 problem document. */
export function sendProblem(
  res: Response,
  status: number,
  detail?: string,
  errors?: FieldError[],
): void {
  res
    .status(status)
    .type("application/problem+json")
    .json({
      type: "about:blank",
      title: STATUS_CODES[status] ?? "Error",
      status,
      ...(detail === undefined ? {} : { detail }),
      ...(errors === undefined ? {} : { errors }),
    });
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, "No resource matches this path"));
};

/** Status of an error raised by Express or body-parser, when it is a client error. */
function clientStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" && status >= 400 && status < 500 ? status : undefined;
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof HttpError) {
      sendProblem(res, err.status, err.detail, err.errors);
      return;
    }
    const type = (err as { type?: unknown }).type;
    if (type === "entity.parse.failed") {
      sendProblem(res, 400, "The request body is not valid JSON", [
        { field: "body", message: "malformed JSON" },
      ]);
      return;
    }
    if (type === "entity.too.large") {
      sendProblem(res, 413, "The request body exceeds 100 kB");
      return;
    }
    const status = clientStatus(err);
    if (status !== undefined) {
      sendProblem(res, status);
      return;
    }
    logger.error({ err, requestId: res.locals.requestId as string }, "unhandled error");
    sendProblem(res, 500);
  };
}
