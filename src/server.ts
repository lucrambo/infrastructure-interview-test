import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import type { DataSource } from "typeorm";
import { createApp } from "./app";
import { ConfigError, loadConfig, type Config } from "./config";
import { createDataSource, initializeDataSource } from "./database";
import { createLogger, type Logger } from "./logger";

/** Longer than the 60 s idle timeout of common load balancers, so they close first. */
export const KEEP_ALIVE_TIMEOUT_MS = 65_000;
/** Must exceed the keep-alive timeout, or Node can drop a socket a client is reusing. */
export const HEADERS_TIMEOUT_MS = 66_000;
/** Upper bound for receiving a whole request. */
export const REQUEST_TIMEOUT_MS = 30_000;
/** How often a draining server closes keep-alive sockets that have become idle. */
const IDLE_SWEEP_MS = 100;

export function createHttpServer(listener: RequestListener): Server {
  const server = createServer(listener);
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  return server;
}

export interface StartOptions {
  config: Config;
  logger: Logger;
  /** Replaced in tests; the real process exits. */
  exit?: (code: number) => void;
  /** Where SIGTERM and SIGINT are listened for. */
  signals?: NodeJS.EventEmitter;
  dataSource?: DataSource;
}

export interface Running {
  app: Express;
  server: Server;
  port: number;
  shutdown: (signal: string) => Promise<void>;
}

/**
 * Connects to the database, then listens. On SIGTERM or SIGINT it fails readiness, stops
 * accepting connections, lets in-flight requests finish, closes the pool and exits 0; if that
 * takes longer than `shutdownTimeoutMs` it exits 1.
 */
export async function start({
  config,
  logger,
  exit = (code) => process.exit(code),
  signals = process,
  dataSource = createDataSource(config.db),
}: StartOptions): Promise<Running> {
  await initializeDataSource(dataSource);

  let draining = false;
  const app = createApp({ dataSource, logger, isDraining: () => draining });
  const server = createHttpServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  logger.info({ port }, "listening");

  const shutdown = async (signal: string): Promise<void> => {
    if (draining) return;
    draining = true;
    logger.info({ signal }, "shutting down");
    const timer = setTimeout(() => {
      logger.error({ timeoutMs: config.shutdownTimeoutMs }, "shutdown timed out");
      exit(1);
    }, config.shutdownTimeoutMs);
    try {
      // close() waits for every open socket; a keep-alive socket whose request was in flight
      // turns idle only after its response, so idle sockets are swept until the server closes
      const sweep = setInterval(() => {
        server.closeIdleConnections();
      }, IDLE_SWEEP_MS);
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => {
            if (err) reject(err);
            else resolve();
          });
          server.closeIdleConnections();
        });
      } finally {
        clearInterval(sweep);
      }
      await dataSource.destroy();
      clearTimeout(timer);
      logger.info("shutdown complete");
      exit(0);
    } catch (err) {
      clearTimeout(timer);
      logger.error({ err }, "shutdown failed");
      exit(1);
    }
  };
  // `on`, not `once`: a repeated signal must reach the guard above, not Node's default handler,
  // which would kill the process mid-drain
  for (const signal of ["SIGTERM", "SIGINT"]) {
    signals.on(signal, () => void shutdown(signal));
  }

  return { app, server, port, shutdown };
}

async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    createLogger("info").fatal({ variables: err.variables }, "invalid configuration");
    process.exit(1);
  }
  const logger = createLogger(config.logLevel);
  try {
    await start({ config, logger });
  } catch (err) {
    logger.fatal({ err }, "startup failed");
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
