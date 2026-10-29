import { randomUUID } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { collectDefaultMetrics, Histogram, Registry } from "prom-client";
import type { Logger } from "../logger";

const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Paths polled by the orchestrator and the scraper; logging them would drown real traffic. */
export const PROBE_PATHS = new Set(["/healthz", "/readyz", "/metrics"]);

/** Reuses a well-formed incoming `X-Request-Id`, or issues a new one, and echoes it back. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get("x-request-id");
  const id = incoming !== undefined && REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
};

/** One JSON line per completed request: no headers and no body, so no credentials leak. */
export function accessLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    if (PROBE_PATHS.has(req.path)) {
      next();
      return;
    }
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const fields = {
        requestId: res.locals.requestId as string,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseTime: Number(process.hrtime.bigint() - start) / 1e6,
      };
      if (res.statusCode >= 500) logger.error(fields, "request completed");
      else logger.info(fields, "request completed");
    });
    next();
  };
}

/** The route template, never the raw URL, so path parameters cannot explode label cardinality. */
function routeLabel(req: Request): string {
  const path = (req.route as { path?: unknown } | undefined)?.path;
  return typeof path === "string" ? path : "unmatched";
}

export interface Metrics {
  registry: Registry;
  middleware: RequestHandler;
}

export function createMetrics(): Metrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  const duration = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"] as const,
    registers: [registry],
  });
  const middleware: RequestHandler = (req, res, next) => {
    const end = duration.startTimer();
    res.on("finish", () => {
      end({ method: req.method, route: routeLabel(req), status_code: String(res.statusCode) });
    });
    next();
  };
  return { registry, middleware };
}
