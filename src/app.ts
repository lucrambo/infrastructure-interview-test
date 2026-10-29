import express, { type Express } from "express";
import helmet from "helmet";
import type { DataSource } from "typeorm";
import { errorHandler, HttpError, notFoundHandler } from "./http/errors";
import { accessLog, createMetrics, requestId } from "./http/observability";
import type { Logger } from "./logger";
import { AppRoutes } from "./routes";

/** A readiness probe that waits longer than this reports the replica as not ready. */
const READINESS_TIMEOUT_MS = 1000;

export interface AppOptions {
  dataSource: DataSource;
  logger: Logger;
  /** True once the process has started to shut down. */
  isDraining?: () => boolean;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timed out after ${ms} ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createApp({ dataSource, logger, isDraining = () => false }: AppOptions): Express {
  const app = express();
  const metrics = createMetrics();

  app.disable("x-powered-by");
  app.use(requestId);
  app.use(accessLog(logger));
  app.use(metrics.middleware);
  app.use(helmet());
  app.use((_req, res, next) => {
    // ask keep-alive clients to reconnect elsewhere once this replica is draining
    if (isDraining()) res.setHeader("Connection", "close");
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/readyz", async (_req, res) => {
    if (isDraining()) {
      throw new HttpError(503, "Shutting down");
    }
    try {
      await withTimeout(dataSource.query("SELECT 1"), READINESS_TIMEOUT_MS);
    } catch (err) {
      logger.warn({ err }, "readiness check failed");
      throw new HttpError(503, "Database unavailable");
    }
    res.json({ status: "ok" });
  });

  app.get("/metrics", async (_req, res) => {
    res.type(metrics.registry.contentType).send(await metrics.registry.metrics());
  });

  app.use(express.json({ limit: "100kb" }));

  // register all application routes; Express 5 forwards rejected promises to the error handler
  for (const route of AppRoutes) {
    app[route.method](route.path, (request, response) =>
      route.action(request, response, dataSource),
    );
  }

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
