import { z } from "zod";

const port = z.coerce.number().int().min(1).max(65535);
const positiveInt = z.coerce.number().int().positive();
const booleanFlag = z.enum(["true", "false"]).transform((value) => value === "true");

const schema = z.object({
  PORT: port.default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SHUTDOWN_TIMEOUT_MS: positiveInt.default(25000),
  DB_HOST: z.string().min(1),
  DB_PORT: port.default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  DB_SSL: booleanFlag.default(false),
  DB_POOL_MAX: positiveInt.default(10),
});

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
  ssl: boolean;
  poolMax: number;
}

export interface Config {
  port: number;
  logLevel: string;
  shutdownTimeoutMs: number;
  db: DatabaseConfig;
}

/** Raised when the environment does not hold a valid configuration; carries variable names only. */
export class ConfigError extends Error {
  constructor(readonly variables: string[]) {
    super(`Invalid configuration: ${variables.join(", ")}`);
    this.name = "ConfigError";
  }
}

/**
 * Reads the configuration from environment variables. Empty strings count as unset, so a
 * Kubernetes manifest that renders `value: ""` falls back to the default instead of failing.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = schema.safeParse(present);
  if (!result.success) {
    const variables = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new ConfigError(variables.sort());
  }
  const c = result.data;
  return {
    port: c.PORT,
    logLevel: c.LOG_LEVEL,
    shutdownTimeoutMs: c.SHUTDOWN_TIMEOUT_MS,
    db: {
      host: c.DB_HOST,
      port: c.DB_PORT,
      user: c.DB_USER,
      password: c.DB_PASSWORD,
      name: c.DB_NAME,
      ssl: c.DB_SSL,
      poolMax: c.DB_POOL_MAX,
    },
  };
}
